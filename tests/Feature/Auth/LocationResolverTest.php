<?php

namespace Tests\Feature\Auth;

use App\Models\Auth\NetworkName;
use App\Services\Auth\DbIpLookup;
use App\Services\Auth\GeoIpLookup;
use App\Services\Auth\LocationResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// LocationResolver puts an admin-named network before the GeoIP place and never throws.
class LocationResolverTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->app->instance(GeoIpLookup::class, new class implements GeoIpLookup
        {
            public function place(string $ip): ?string
            {
                return 'Bangkok, Thailand';
            }
        });
    }

    private function resolver(): LocationResolver
    {
        return $this->app->make(LocationResolver::class);
    }

    public function test_a_network_name_wins_over_geoip(): void
    {
        NetworkName::create(['cidr' => '203.150.12.80/29', 'name' => 'สำนักงานใหญ่']);

        $this->assertSame('สำนักงานใหญ่', $this->resolver()->resolve('203.150.12.85'));
    }

    public function test_the_longest_prefix_wins(): void
    {
        NetworkName::create(['cidr' => '203.150.12.0/24', 'name' => 'A']);
        NetworkName::create(['cidr' => '203.150.12.80/29', 'name' => 'B']);

        $this->assertSame('B', $this->resolver()->resolve('203.150.12.85'));
        $this->assertSame('A', $this->resolver()->resolve('203.150.12.200'));
    }

    public function test_other_ips_use_geoip(): void
    {
        NetworkName::create(['cidr' => '203.150.12.80/29', 'name' => 'สำนักงานใหญ่']);

        $this->assertSame('Bangkok, Thailand', $this->resolver()->resolve('8.8.8.8'));
    }

    public function test_no_database_file_means_no_place(): void
    {
        $resolver = new LocationResolver(new DbIpLookup(storage_path('app/geoip/missing-test-file.mmdb')));

        $this->assertNull($resolver->resolve('8.8.8.8'));
    }

    public function test_ipv6_and_empty_ip_do_not_throw(): void
    {
        NetworkName::create(['cidr' => '2001:db8::/32', 'name' => 'Lab v6']);

        $this->assertSame('Bangkok, Thailand', $this->resolver()->resolve('::1'));
        $this->assertSame('Lab v6', $this->resolver()->resolve('2001:db8::1'));
        $this->assertNull($this->resolver()->resolve(null));
        $this->assertNull($this->resolver()->resolve(''));
    }

    public function test_a_malformed_network_row_is_ignored(): void
    {
        NetworkName::create(['cidr' => 'garbage', 'name' => 'Broken']);

        $this->assertSame('Bangkok, Thailand', $this->resolver()->resolve('8.8.8.8'));
    }

    public function test_network_names_are_cached_under_their_key(): void
    {
        NetworkName::create(['cidr' => '10.0.0.0/8', 'name' => 'Internal']);
        $this->assertSame('Internal', $this->resolver()->resolve('10.1.1.1'));

        NetworkName::query()->delete();
        $this->assertSame('Internal', $this->resolver()->resolve('10.1.1.1'));

        cache()->forget('network-names');
        $this->assertSame('Bangkok, Thailand', $this->resolver()->resolve('10.1.1.1'));
    }
}
