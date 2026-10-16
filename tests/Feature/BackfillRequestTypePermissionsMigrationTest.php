<?php

// Drives the request-type permission backfill migration (up and down) against crafted role rows.

namespace Tests\Feature;

use App\Enums\Request\RequestType;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BackfillRequestTypePermissionsMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function migration(): object
    {
        return require database_path('migrations/2026_10_17_033149_backfill_request_type_permissions.php');
    }

    /** @return list<string> */
    private function typeKeys(): array
    {
        return array_map(fn (RequestType $type) => "requests.submit_{$type->value}", RequestType::cases());
    }

    private function allowed(Role $role, string $key): ?bool
    {
        $row = RolePermission::where('role_id', $role->id)->where('permission', $key)->first();

        return $row === null ? null : (bool) $row->allowed;
    }

    private function allowedTypeCount(Role $role): int
    {
        return RolePermission::where('role_id', $role->id)->whereIn('permission', $this->typeKeys())->where('allowed', true)->count();
    }

    /** @param array<int, string> $keys */
    private function grant(Role $role, array $keys): void
    {
        foreach ($keys as $key) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $key, 'allowed' => true]);
        }
    }

    /** @return array{0: Role, 1: Role, 2: Role, 3: Role} */
    private function arrange(): array
    {
        $a = Role::firstOrCreate(['key' => 'mig_a'], ['name' => 'A']);
        $b = Role::firstOrCreate(['key' => 'mig_b'], ['name' => 'B']);
        $admin = Role::firstOrCreate(['key' => 'admin'], ['name' => 'Admin']);
        $lead = Role::firstOrCreate(['key' => 'it_supervisorleader'], ['name' => 'Lead']);
        $this->grant($a, ['requests.module', 'requests.submit']);
        $this->grant($b, ['requests.module']);
        $this->grant($admin, ['requests.module', 'requests.view_all']);
        $this->grant($lead, ['requests.module', 'requests.view_all']);

        return [$a, $b, $admin, $lead];
    }

    public function test_up_grants_filers_every_type_and_it_the_cancel_right(): void
    {
        [$a, $b, $admin, $lead] = $this->arrange();

        $this->migration()->up();

        $this->assertSame(13, $this->allowedTypeCount($a));
        $this->assertSame(0, $this->allowedTypeCount($b));
        $this->assertFalse($this->allowed($b, $this->typeKeys()[0]));
        $this->assertTrue($this->allowed($admin, 'requests.cancel_any'));
        $this->assertTrue($this->allowed($lead, 'requests.cancel_any'));
        $this->assertFalse($this->allowed($a, 'requests.cancel_any'));
        $this->assertFalse($this->allowed($b, 'requests.cancel_any'));
        $this->assertSame(13, RolePermission::where('role_id', $b->id)->whereIn('permission', $this->typeKeys())->count());
    }

    public function test_an_it_lead_without_view_all_gets_no_cancel_right(): void
    {
        [, , $admin] = $this->arrange();
        RolePermission::where('role_id', $admin->id)->where('permission', 'requests.view_all')->delete();

        $this->migration()->up();

        $this->assertFalse($this->allowed($admin, 'requests.cancel_any'));
    }

    public function test_a_second_up_adds_nothing_and_keeps_existing_rows(): void
    {
        [$a] = $this->arrange();
        RolePermission::create(['role_id' => $a->id, 'permission' => 'requests.cancel_any', 'allowed' => true]);

        $migration = $this->migration();
        $migration->up();
        $count = RolePermission::count();
        $migration->up();

        $this->assertSame($count, RolePermission::count());
        $this->assertTrue($this->allowed($a, 'requests.cancel_any'));
    }

    public function test_down_removes_the_fourteen_keys(): void
    {
        $this->arrange();
        $migration = $this->migration();
        $migration->up();

        $migration->down();

        $this->assertSame(0, RolePermission::whereIn('permission', [...$this->typeKeys(), 'requests.cancel_any'])->count());
        $this->assertSame(7, RolePermission::where('permission', 'like', 'requests.%')->count());
    }
}
