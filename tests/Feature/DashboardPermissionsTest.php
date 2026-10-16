<?php

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The Dashboard's own section switches: catalog, role defaults, and the one-off backfill. */
class DashboardPermissionsTest extends TestCase
{
    use RefreshDatabase;

    /** The right that showed each section before the switches existed — the backfill's map. */
    private const FROM = [
        'tickets.view_all' => 'dashboard.view_it',
        'requests.view_all' => 'dashboard.view_requests',
        'contracts.module' => 'dashboard.view_contracts',
        'employees.view_dashboard' => 'dashboard.view_hr',
        'system.view_audit' => 'dashboard.view_activity',
    ];

    public function test_the_catalog_lists_the_five_switches(): void
    {
        $this->assertSame(
            ['view_it', 'view_requests', 'view_contracts', 'view_hr', 'view_activity'],
            Permissions::catalog()['dashboard'],
        );
    }

    public function test_role_defaults_grant_a_switch_exactly_when_they_grant_its_source_right(): void
    {
        foreach (Permissions::defaults() as $role => $keys) {
            foreach (self::FROM as $source => $switch) {
                $this->assertSame(in_array($source, $keys, true), in_array($switch, $keys, true), "{$role}: {$switch}");
            }
        }
    }

    public function test_the_backfill_grants_each_switch_to_roles_holding_its_source_right(): void
    {
        $desk = Role::create(['key' => 'desk_x', 'name' => 'Desk', 'is_system' => false]);
        $staff = Role::create(['key' => 'staff_x', 'name' => 'Staff', 'is_system' => false]);
        RolePermission::create(['role_id' => $desk->id, 'permission' => 'tickets.view_all', 'allowed' => true]);
        RolePermission::create(['role_id' => $desk->id, 'permission' => 'system.view_audit', 'allowed' => true]);
        // A row switched off is not a grant.
        RolePermission::create(['role_id' => $staff->id, 'permission' => 'requests.view_all', 'allowed' => false]);

        $migration = require collect(glob(database_path('migrations/*_backfill_dashboard_permissions.php')))->sole();
        $migration->up();
        $migration->up();

        $granted = fn (Role $role) => RolePermission::where('role_id', $role->id)
            ->where('allowed', true)
            ->where('permission', 'like', 'dashboard.%')
            ->orderBy('permission')
            ->pluck('permission')
            ->all();

        $this->assertSame(['dashboard.view_activity', 'dashboard.view_it'], $granted($desk));
        $this->assertSame([], $granted($staff));
    }

    /** Saving a Role Template before the backfill writes every switch as off; the backfill must still turn on the earned ones. */
    public function test_the_backfill_turns_on_a_switch_a_template_save_wrote_as_off(): void
    {
        $desk = Role::create(['key' => 'desk_y', 'name' => 'Desk', 'is_system' => false]);
        RolePermission::create(['role_id' => $desk->id, 'permission' => 'tickets.view_all', 'allowed' => true]);
        RolePermission::create(['role_id' => $desk->id, 'permission' => 'dashboard.view_it', 'allowed' => false]);
        RolePermission::create(['role_id' => $desk->id, 'permission' => 'dashboard.view_hr', 'allowed' => false]);

        $migration = require collect(glob(database_path('migrations/*_backfill_dashboard_permissions.php')))->sole();
        $migration->up();

        $allowed = RolePermission::where('role_id', $desk->id)->where('permission', 'like', 'dashboard.%')
            ->orderBy('permission')->pluck('allowed', 'permission')->map(fn ($on) => (bool) $on)->all();
        // Earned from tickets.view_all → on; nothing earned view_hr → left as the template saved it.
        $this->assertSame(['dashboard.view_hr' => false, 'dashboard.view_it' => true], $allowed);
    }
}
