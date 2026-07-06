<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Proves the dedup step added to `2026_07_06_050012_convert_assets_location_to_fk`
 * makes the migration self-healing when `locations.name` already has duplicates.
 *
 * The unique index added by `2026_07_06_060544_add_unique_index_to_locations_name`
 * blocks inserting a duplicate name once both migrations have run, so the only way
 * to exercise the dedup path is to roll both migrations back to the pre-migration
 * schema (assets.location as a plain string, no unique index on locations.name),
 * seed a duplicate-name scenario directly against the database, then re-run the
 * migrations and assert they succeed and produce a single, correctly-referenced row.
 */
class LocationFkMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_migration_dedups_pre_existing_duplicate_location_names(): void
    {
        // Roll back one migration at a time until the pre-FK location schema
        // (assets.location as a plain string) is restored. A fixed --step count
        // would break whenever a later phase adds migrations on top of the
        // location ones (e.g. the stock unit/warranty FK migration), so we stop
        // exactly when the location FK migration's down() has run.
        while (! Schema::hasColumn('assets', 'location')) {
            Artisan::call('migrate:rollback', ['--step' => 1]);
        }

        $this->assertTrue(
            Schema::hasColumn('assets', 'location'),
            'rollback should have restored the plain string location column on assets'
        );
        $this->assertFalse(
            Schema::hasColumn('assets', 'location_id'),
            'rollback should have dropped the location_id FK column'
        );

        // Seed the pre-migration state directly (bypassing the model/validation,
        // which now rejects duplicate names): two locations sharing the same name,
        // and an asset that references the location by name only.
        $keepId = DB::table('locations')->insertGetId([
            'name' => 'HQ',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $dropId = DB::table('locations')->insertGetId([
            'name' => 'HQ',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('assets')->insert([
            'tag' => 'TEST-DEDUP-0001',
            'model' => 'Dedup Test Model',
            'location' => 'HQ',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Re-apply the two migrations. Before the fix, the FK backfill's correlated
        // subquery would raise SQL error 1242 (subquery returns more than one row) on
        // MariaDB, and the unique-index migration would fail outright on the duplicate.
        Artisan::call('migrate');

        $locations = DB::table('locations')->where('name', 'HQ')->get();
        $this->assertCount(1, $locations, 'duplicate location names must be deduped by the migration');
        $this->assertSame((int) $keepId, (int) $locations->first()->id, 'the lowest id must be the survivor');
        $this->assertDatabaseMissing('locations', ['id' => $dropId]);

        $asset = DB::table('assets')->where('tag', 'TEST-DEDUP-0001')->first();
        $this->assertNotNull($asset->location_id, 'the asset must be backfilled onto a location');
        $this->assertSame((int) $keepId, (int) $asset->location_id, 'the asset must be backfilled onto the surviving location');
    }
}
