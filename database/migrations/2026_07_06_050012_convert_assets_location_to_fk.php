<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * MariaDB DDL statements are non-transactional — if this migration fails partway through
     * (e.g. mid-schema-change), the ALTER/CREATE statements already run are NOT rolled back.
     * Back up the database before running this migration in production (per CLAUDE.md).
     *
     * Step order matters:
     *   1) Dedup any pre-existing duplicate `locations.name` rows (keep the lowest id). Must
     *      run first, while `assets.location` is still the plain string column, so every
     *      asset name later maps onto the single surviving row for that name.
     *   2) Create any missing location masters referenced only by `assets.location`.
     *   3) Add the `location_id` FK column.
     *   4) Backfill `location_id` from the (now-deduped) name via a correlated subquery.
     *   5) Drop the old `location` string column.
     */
    public function up(): void
    {
        // 1. Dedup pre-existing duplicate location names, keeping the lowest id per trimmed
        // name. Grouped in PHP (not `DELETE ... JOIN` / `UPDATE ... JOIN`) so this is both
        // SQLite-safe and MariaDB-safe. Safe to delete here because nothing yet references
        // locations by id — assets still link by the string `location` column at this point.
        DB::table('locations')
            ->select('id', 'name')
            ->orderBy('id')
            ->get()
            ->groupBy(fn ($location) => trim($location->name))
            ->each(function ($duplicates) {
                if ($duplicates->count() <= 1) {
                    return;
                }
                // Rows are ordered by id ascending, so the first one is the lowest id to keep.
                $idsToDelete = $duplicates->pluck('id')->skip(1)->all();
                DB::table('locations')->whereIn('id', $idsToDelete)->delete();
            });

        // 2. Create any location master rows missing for names already on assets.
        DB::table('assets')
            ->whereNotNull('location')
            ->where('location', '!=', '')
            ->distinct()
            ->pluck('location')
            ->each(function (string $name) {
                // Skip whitespace-only values (e.g. "   ") — trimming them would seed a blank-named location.
                if (trim($name) === '') {
                    return;
                }
                DB::table('locations')->updateOrInsert(['name' => trim($name)], []);
            });

        // 3. Add the FK column (nullable; block deleting a referenced location at the DB layer too).
        Schema::table('assets', function (Blueprint $table) {
            $table->foreignId('location_id')->nullable()->after('location')->constrained('locations')->restrictOnDelete();
        });

        // 4. Backfill the id by matching the trimmed name (correlated subquery — SQLite-safe).
        DB::statement('UPDATE assets SET location_id = (SELECT id FROM locations WHERE locations.name = TRIM(assets.location)) WHERE location IS NOT NULL AND location != ""');

        // 5. Drop the old name column.
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn('location');
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->string('location')->nullable()->after('serial');
        });
        DB::statement('UPDATE assets SET location = (SELECT name FROM locations WHERE locations.id = assets.location_id) WHERE location_id IS NOT NULL');
        Schema::table('assets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('location_id');
        });
    }
};
