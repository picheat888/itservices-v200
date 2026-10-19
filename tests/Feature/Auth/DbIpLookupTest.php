<?php

namespace Tests\Feature\Auth;

use App\Services\Auth\DbIpLookup;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

// DbIpLookup never throws: a missing, unreadable or invalid input gives null, and names are joined city first.
class DbIpLookupTest extends TestCase
{
    public function test_a_missing_file_gives_null(): void
    {
        $this->assertNull((new DbIpLookup(storage_path('app/geoip/missing-test-file.mmdb')))->place('8.8.8.8'));
    }

    public function test_an_unreadable_file_gives_null(): void
    {
        $file = sys_get_temp_dir().DIRECTORY_SEPARATOR.'itsd-not-a-database-'.bin2hex(random_bytes(4)).'.mmdb';
        File::put($file, 'this is not a MaxMind database');

        try {
            $this->assertNull((new DbIpLookup($file))->place('8.8.8.8'));
        } finally {
            File::delete($file);
        }
    }

    public function test_an_invalid_ip_gives_null(): void
    {
        $this->assertNull((new DbIpLookup(storage_path('app/geoip/missing-test-file.mmdb')))->place('garbage'));
    }

    public function test_the_place_names_are_joined(): void
    {
        $this->assertSame('Bangkok, Thailand', DbIpLookup::format('Bangkok', 'Thailand'));
        $this->assertSame('Thailand', DbIpLookup::format(null, 'Thailand'));
        $this->assertSame('Thailand', DbIpLookup::format('', 'Thailand'));
        $this->assertNull(DbIpLookup::format('Bangkok', null));
        $this->assertNull(DbIpLookup::format(null, null));
    }

    public function test_the_default_path_is_inside_storage(): void
    {
        $this->assertSame('app/geoip/dbip-city-lite.mmdb', DbIpLookup::PATH);
        $this->assertSame(storage_path('app/geoip/dbip-city-lite.mmdb'), DbIpLookup::databasePath());
    }
}
