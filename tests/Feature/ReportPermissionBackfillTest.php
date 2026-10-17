<?php

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Support\Permissions;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// The one-off grant of reports.* from the Workspace rights that opened reports before, and the defaults that follow it.
class ReportPermissionBackfillTest extends TestCase
{
    use RefreshDatabase;

    private function migration(): Migration
    {
        return require database_path('migrations/2026_10_17_190000_backfill_report_permissions.php');
    }

    /** @param list<string> $permissions */
    private function roleWith(array $permissions, bool $allowed = true): Role
    {
        $role = Role::create(['key' => 'bf_'.uniqid(), 'name' => 'Backfill', 'is_system' => false]);
        foreach ($permissions as $key) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $key, 'allowed' => $allowed]);
        }

        return $role;
    }

    /** @return list<string> */
    private function reportKeys(Role $role): array
    {
        $keys = RolePermission::where('role_id', $role->id)->where('allowed', true)->where('permission', 'like', 'reports.%')->pluck('permission')->all();
        sort($keys);

        return $keys;
    }

    public function test_a_desk_role_gets_the_ticket_switch_and_the_tools(): void
    {
        $desk = $this->roleWith(['tickets.view_all', 'tickets.resolve']);

        $this->migration()->up();

        $this->assertSame(['reports.export', 'reports.module', 'reports.schedule', 'reports.tickets'], $this->reportKeys($desk));
    }

    public function test_seeing_all_tickets_without_working_them_gets_nothing(): void
    {
        $viewer = $this->roleWith(['tickets.view_all']);

        $this->migration()->up();

        $this->assertSame([], $this->reportKeys($viewer));
    }

    public function test_any_one_access_report_gate_gives_the_access_switch(): void
    {
        $software = $this->roleWith(['access.software_view']);
        $partialMembers = $this->roleWith(['access.email_view', 'access.file_view']);

        $this->migration()->up();

        $this->assertContains('reports.access', $this->reportKeys($software));
        $this->assertSame([], $this->reportKeys($partialMembers));
    }

    public function test_a_role_with_no_report_gets_nothing_and_a_switched_off_right_counts_for_nothing(): void
    {
        $staff = $this->roleWith(['tickets.create', 'tickets.my']);
        $off = $this->roleWith(['assets.view'], allowed: false);

        $this->migration()->up();

        $this->assertSame([], $this->reportKeys($staff));
        $this->assertSame([], $this->reportKeys($off));
    }

    public function test_backfill_turns_on_a_switch_a_template_save_wrote_as_off(): void
    {
        $role = $this->roleWith(['stock.view']);
        RolePermission::create(['role_id' => $role->id, 'permission' => 'reports.stock', 'allowed' => false]);

        $this->migration()->up();
        $this->migration()->up();

        $this->assertSame(['reports.export', 'reports.module', 'reports.schedule', 'reports.stock'], $this->reportKeys($role));
        $this->assertSame(1, RolePermission::where('role_id', $role->id)->where('permission', 'reports.stock')->count());
    }

    public function test_defaults_follow_the_backfill_rule(): void
    {
        $migration = $this->migration();

        foreach (Permissions::defaults() as $role => $keys) {
            $own = array_values(array_filter($keys, fn (string $k) => ! str_starts_with($k, 'reports.')));
            $reports = array_values(array_filter($keys, fn (string $k) => str_starts_with($k, 'reports.')));
            $expected = $migration->grantsFor($own);
            sort($reports);
            sort($expected);

            $this->assertSame($expected, $reports, $role);
        }
    }
}
