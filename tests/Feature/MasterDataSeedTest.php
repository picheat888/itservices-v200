<?php

namespace Tests\Feature;

use App\Models\Settings\Vendor;
use Database\Seeders\MasterDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Re-seeding master data on a database that already holds it.
 *
 * Vendors are the case worth pinning: `vendors.name` used to hold the Thai company
 * name and now holds the English one, with Thai moved to `name_th`. The seeder has
 * to recognise a row seeded under the old shape and update it, because `name` is
 * unique — a second insert is not a duplicate, it is a failed seed.
 */
class MasterDataSeedTest extends TestCase
{
    use RefreshDatabase;

    private const LEGACY_THAI_NAME = 'บริษัท ไมโครซอฟท์ (ประเทศไทย) จำกัด';

    private const ENGLISH_NAME = 'Microsoft (Thailand) Limited';

    public function test_a_vendor_seeded_under_its_thai_name_is_updated_not_duplicated(): void
    {
        Vendor::create(['name' => self::LEGACY_THAI_NAME]);

        $this->seed(MasterDataSeeder::class);

        $this->assertSame(0, Vendor::where('name', self::LEGACY_THAI_NAME)->count(), 'the old row was renamed, not left behind');
        $migrated = Vendor::where('name_th', self::LEGACY_THAI_NAME)->get();
        $this->assertCount(1, $migrated, 'exactly one row for this vendor');
        $this->assertSame(self::ENGLISH_NAME, $migrated->first()->name);
    }

    public function test_seeding_twice_leaves_the_same_number_of_vendors(): void
    {
        $this->seed(MasterDataSeeder::class);
        $afterFirst = Vendor::count();

        $this->seed(MasterDataSeeder::class);

        $this->assertGreaterThan(0, $afterFirst);
        $this->assertSame($afterFirst, Vendor::count());
    }

    public function test_every_seeded_vendor_carries_both_names(): void
    {
        $this->seed(MasterDataSeeder::class);

        foreach (Vendor::all() as $vendor) {
            $this->assertNotEmpty($vendor->name, 'an English name');
            $this->assertNotEmpty($vendor->name_th, "a Thai name for {$vendor->name}");
        }
    }
}
