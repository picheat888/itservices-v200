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
    }
}
