<?php

// Drives the self-service permission rename migration directly (up and down) against crafted role rows.

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RenameSelfServicePermissionsMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function migration(): object
    {
        return require database_path('migrations/2026_10_16_120000_rename_self_service_permissions.php');
    }

    /** @return array<int, string> */
    private function keysOf(Role $role): array
    {
        $keys = RolePermission::where('role_id', $role->id)->pluck('permission')->all();
        sort($keys);

        return $keys;
    }

    /** @param array<int, string> $keys */
    private function grant(Role $role, array $keys): void
    {
        foreach ($keys as $key) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $key, 'allowed' => true]);
        }
    }

    private function allowed(Role $role, string $key): ?bool
    {
        $row = RolePermission::where('role_id', $role->id)->where('permission', $key)->first();

        return $row === null ? null : (bool) $row->allowed;
    }

    public function test_up_and_down_move_the_rows_and_dedupe(): void
    {
        $a = Role::firstOrCreate(['key' => 'mig_a'], ['name' => 'A']);
        $b = Role::firstOrCreate(['key' => 'mig_b'], ['name' => 'B']);
        $this->grant($a, ['employees.edit_own', 'assets.my', 'assets.return', 'access.my']);
        $this->grant($b, ['profile.edit', 'employees.edit_own', 'assets.my']);

        $migration = $this->migration();
        $migration->up();

        $this->assertSame(['profile.edit', 'profile.return_assets'], $this->keysOf($a));
        $this->assertSame(['profile.edit'], $this->keysOf($b));
        $this->assertSame(0, RolePermission::whereIn('permission', ['employees.edit_own', 'assets.my', 'assets.return', 'access.my'])->count());

        $migration->down();

        $this->assertSame(['access.my', 'assets.my', 'assets.return', 'employees.edit_own'], $this->keysOf($a));
        $this->assertSame(['access.my', 'assets.my', 'employees.edit_own'], $this->keysOf($b));
        $this->assertSame(0, RolePermission::where('permission', 'like', 'profile.%')->count());

        // Both roles held an allowed profile key, so every restored row is allowed
        foreach (['access.my', 'assets.my', 'assets.return', 'employees.edit_own'] as $key) {
            $this->assertTrue($this->allowed($a, $key), "A {$key}");
        }
        foreach (['access.my', 'assets.my', 'employees.edit_own'] as $key) {
            $this->assertTrue($this->allowed($b, $key), "B {$key}");
        }
    }

    public function test_down_restores_self_service_rows_denied_when_no_profile_key_is_allowed(): void
    {
        $role = Role::firstOrCreate(['key' => 'mig_mixed'], ['name' => 'Mixed']);
        RolePermission::create(['role_id' => $role->id, 'permission' => 'profile.edit', 'allowed' => false]);
        RolePermission::create(['role_id' => $role->id, 'permission' => 'profile.return_assets', 'allowed' => false]);

        $this->migration()->down();

        $this->assertSame(['access.my', 'assets.my', 'assets.return', 'employees.edit_own'], $this->keysOf($role));
        $this->assertFalse($this->allowed($role, 'assets.my'));
        $this->assertFalse($this->allowed($role, 'access.my'));
    }

    public function test_up_keeps_the_stronger_grant_when_both_keys_exist(): void
    {
        $role = Role::firstOrCreate(['key' => 'mig_merge'], ['name' => 'Merge']);
        RolePermission::create(['role_id' => $role->id, 'permission' => 'employees.edit_own', 'allowed' => true]);
        RolePermission::create(['role_id' => $role->id, 'permission' => 'profile.edit', 'allowed' => false]);

        $this->migration()->up();

        $rows = RolePermission::where('role_id', $role->id)->where('permission', 'profile.edit')->get();
        $this->assertCount(1, $rows);
        $this->assertTrue((bool) $rows->first()->allowed);
        $this->assertSame(['profile.edit'], $this->keysOf($role));
    }

    public function test_denied_rows_stay_denied_through_up_and_down(): void
    {
        $role = Role::firstOrCreate(['key' => 'mig_denied'], ['name' => 'Denied']);
        RolePermission::create(['role_id' => $role->id, 'permission' => 'employees.edit_own', 'allowed' => false]);

        $migration = $this->migration();
        $migration->up();

        $row = RolePermission::where('role_id', $role->id)->where('permission', 'profile.edit')->first();
        $this->assertNotNull($row);
        $this->assertFalse((bool) $row->allowed);
        $this->assertSame(1, RolePermission::where('role_id', $role->id)->count());

        $migration->down();

        $row = RolePermission::where('role_id', $role->id)->where('permission', 'employees.edit_own')->first();
        $this->assertNotNull($row);
        $this->assertFalse((bool) $row->allowed);

        $this->assertFalse($this->allowed($role, 'assets.my'));
        $this->assertFalse($this->allowed($role, 'access.my'));
        $this->assertSame(3, RolePermission::where('role_id', $role->id)->count());
    }
}
