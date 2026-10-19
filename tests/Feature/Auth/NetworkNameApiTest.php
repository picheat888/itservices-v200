<?php

// Network names under Settings → Security: CRUD gated by settings.security, CIDR validation, and the resolver seeing a write at once.

namespace Tests\Feature\Auth;

use App\Models\AuditLog;
use App\Models\Auth\NetworkName;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Services\Auth\GeoIpLookup;
use App\Services\Auth\LocationResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class NetworkNameApiTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:8000';

    private function asAdmin(): static
    {
        return $this->actingAs(User::factory()->create(['role' => 'super']))->withHeader('Origin', self::ORIGIN);
    }

    private function asHolderOf(string ...$permissions): static
    {
        $role = Role::create(['key' => 'netrole', 'name' => 'Net', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return $this->actingAs(User::factory()->create(['role' => 'netrole']))->withHeader('Origin', self::ORIGIN);
    }

    public function test_the_list_returns_every_network_with_its_total(): void
    {
        NetworkName::create(['cidr' => '203.150.12.80/29', 'name' => 'Head office']);
        NetworkName::create(['cidr' => '10.0.0.0/8', 'name' => 'Branch VPN']);

        $this->asAdmin()->getJson('/api/settings/network-names')
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonCount(2, 'data')
            ->assertJsonStructure(['data' => [['id', 'cidr', 'name']]]);
    }

    public function test_a_network_can_be_added_changed_and_removed(): void
    {
        $this->asAdmin();

        $id = $this->postJson('/api/settings/network-names', ['cidr' => ' 203.150.12.80/29 ', 'name' => 'Head office'])
            ->assertCreated()
            ->assertJsonPath('message', 'success')
            ->assertJsonPath('data.cidr', '203.150.12.80/29')
            ->assertJsonPath('data.name', 'Head office')
            ->json('data.id');

        $this->putJson("/api/settings/network-names/{$id}", ['cidr' => '203.150.12.80/29', 'name' => 'Bangkok office'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Bangkok office');
        $this->assertSame('Bangkok office', NetworkName::find($id)->name);

        $this->deleteJson("/api/settings/network-names/{$id}")->assertOk()->assertJsonPath('message', 'success');
        $this->assertNull(NetworkName::find($id));

        $this->assertSame(
            ['Created network name', 'Updated network name', 'Deleted network name'],
            AuditLog::orderBy('id')->pluck('action')->all(),
        );
    }

    public function test_a_single_address_and_an_ipv6_range_are_accepted(): void
    {
        $this->asAdmin();

        $this->postJson('/api/settings/network-names', ['cidr' => '203.150.12.85', 'name' => 'One address'])->assertCreated();
        $this->postJson('/api/settings/network-names', ['cidr' => '2001:db8::/32', 'name' => 'IPv6 office'])->assertCreated();
        $this->postJson('/api/settings/network-names', ['cidr' => '2001:db8::1', 'name' => 'IPv6 host'])->assertCreated();
    }

    /** @return array<string, array{string}> */
    public static function invalidRanges(): array
    {
        return [
            'prefix too long for IPv4' => ['10.0.0.0/33'],
            'prefix too long for IPv6' => ['2001:db8::/129'],
            'not an address' => ['abc'],
            'bad octet' => ['300.1.1.1/24'],
            'empty prefix' => ['10.0.0.0/'],
            'signed prefix' => ['10.0.0.0/-1'],
            'text prefix' => ['10.0.0.0/eight'],
            'two slashes' => ['10.0.0.0/8/8'],
            'IPv4-mapped IPv6 range' => ['::ffff:10.0.0.0/8'],
            'IPv4-mapped IPv6 address' => ['::ffff:10.0.0.1'],
        ];
    }

    #[DataProvider('invalidRanges')]
    public function test_an_invalid_ip_or_range_is_refused(string $cidr): void
    {
        $this->asAdmin()->postJson('/api/settings/network-names', ['cidr' => $cidr, 'name' => 'Nope'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('cidr');

        $this->assertSame(0, NetworkName::count());
    }

    public function test_the_range_and_the_name_are_required(): void
    {
        $this->asAdmin()->postJson('/api/settings/network-names', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['cidr', 'name']);

        $this->postJson('/api/settings/network-names', ['cidr' => '10.0.0.0/8', 'name' => str_repeat('a', 101)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');
    }

    public function test_a_range_already_named_is_refused_but_a_network_may_keep_its_own_range(): void
    {
        $existing = NetworkName::create(['cidr' => '10.0.0.0/8', 'name' => 'Branch VPN']);

        $this->asAdmin()->postJson('/api/settings/network-names', ['cidr' => '10.0.0.0/8', 'name' => 'Again'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('cidr');

        $this->putJson("/api/settings/network-names/{$existing->id}", ['cidr' => '10.0.0.0/8', 'name' => 'Branch VPN 2'])->assertOk();

        $other = NetworkName::create(['cidr' => '172.16.0.0/12', 'name' => 'Other']);
        $this->putJson("/api/settings/network-names/{$other->id}", ['cidr' => '10.0.0.0/8', 'name' => 'Other'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('cidr');
    }

    /** @return array<string, array{string, string}> */
    public static function localeWords(): array
    {
        return [
            'English' => ['en', 'The IP or IP range has already been taken.'],
            'Thai' => ['th', 'IP หรือช่วง IP นี้มีอยู่ในระบบแล้ว'],
        ];
    }

    #[DataProvider('localeWords')]
    public function test_a_refused_range_names_the_field_in_words_not_as_cidr(string $locale, string $takenMessage): void
    {
        NetworkName::create(['cidr' => '10.0.0.0/8', 'name' => 'Branch VPN']);
        $this->asAdmin()->withHeader('X-Locale', $locale);

        $taken = $this->postJson('/api/settings/network-names', ['cidr' => '10.0.0.0/8', 'name' => 'Again'])
            ->assertUnprocessable()
            ->json('errors.cidr.0');
        $this->assertSame($takenMessage, $taken);

        $missing = $this->postJson('/api/settings/network-names', ['name' => 'No range'])->assertUnprocessable()->json('errors.cidr.0');
        $this->assertStringNotContainsStringIgnoringCase('cidr', $missing);
    }

    public function test_only_a_holder_of_the_security_key_can_use_it(): void
    {
        $network = NetworkName::create(['cidr' => '10.0.0.0/8', 'name' => 'Branch VPN']);

        $this->asHolderOf('settings.access', 'settings.masterdata');
        $this->getJson('/api/settings/network-names')->assertForbidden();
        $this->postJson('/api/settings/network-names', ['cidr' => '10.1.0.0/16', 'name' => 'X'])->assertForbidden();
        $this->putJson("/api/settings/network-names/{$network->id}", ['cidr' => '10.0.0.0/8', 'name' => 'X'])->assertForbidden();
        $this->deleteJson("/api/settings/network-names/{$network->id}")->assertForbidden();

        $this->assertSame('Branch VPN', $network->fresh()->name);
    }

    public function test_a_holder_of_the_security_key_can_use_it(): void
    {
        $this->asHolderOf('settings.security');

        $this->getJson('/api/settings/network-names')->assertOk();
        $this->postJson('/api/settings/network-names', ['cidr' => '10.1.0.0/16', 'name' => 'Branch'])->assertCreated();
    }

    public function test_a_guest_is_refused(): void
    {
        $this->getJson('/api/settings/network-names')->assertUnauthorized();
    }

    public function test_every_write_reaches_the_location_resolver_at_once(): void
    {
        $this->app->instance(GeoIpLookup::class, new class implements GeoIpLookup
        {
            public function place(string $ip): ?string
            {
                return 'Bangkok, Thailand';
            }
        });
        $resolver = fn () => $this->app->make(LocationResolver::class)->resolve('203.150.12.85');

        // Warm the resolver's cached list before each write
        $this->assertSame('Bangkok, Thailand', $resolver());
        $this->assertTrue(Cache::has(LocationResolver::CACHE_KEY));

        $this->asAdmin();
        $id = $this->postJson('/api/settings/network-names', ['cidr' => '203.150.12.80/29', 'name' => 'Head office'])->json('data.id');
        $this->assertSame('Head office', $resolver());

        $this->putJson("/api/settings/network-names/{$id}", ['cidr' => '203.150.12.80/29', 'name' => 'Bangkok office'])->assertOk();
        $this->assertSame('Bangkok office', $resolver());

        $this->deleteJson("/api/settings/network-names/{$id}")->assertOk();
        $this->assertSame('Bangkok, Thailand', $resolver());
    }
}
