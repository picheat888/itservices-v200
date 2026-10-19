<?php

namespace Tests\Feature;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// The Report Center's own permission module: catalog, hierarchy and what a save keeps.
class ReportPermissionsTest extends TestCase
{
    use RefreshDatabase;

    private const KEYS = [
        'reports.module', 'reports.tickets', 'reports.assets', 'reports.contracts', 'reports.stock',
        'reports.requests', 'reports.employees', 'reports.access', 'reports.export', 'reports.schedule', 'reports.schedule_manage',
    ];

    public function test_the_catalog_carries_every_report_key(): void
    {
        $this->assertSame(self::KEYS, array_values(array_filter(Permissions::all(), fn (string $k) => str_starts_with($k, 'reports.'))));
    }

    public function test_the_hierarchy_has_one_master_and_independent_children(): void
    {
        $hierarchy = Permissions::reportHierarchy();

        $this->assertSame('reports.module', $hierarchy['master']);
        $this->assertSame(array_slice(self::KEYS, 1), array_keys($hierarchy['groups']));
        $this->assertSame([], array_merge(...array_values($hierarchy['groups'])));
    }

    public function test_without_the_master_every_report_key_is_dropped(): void
    {
        $this->assertSame(['tickets.create'], Permissions::normalizeReports(['reports.assets', 'reports.export', 'tickets.create']));
    }

    public function test_with_the_master_children_stand_alone(): void
    {
        $granted = ['reports.module', 'reports.export', 'tickets.create'];

        $this->assertSame($granted, Permissions::normalizeReports($granted));
    }

    public function test_saving_a_role_without_the_master_stores_the_children_as_off(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $editor = User::factory()->create(['role' => 'super']);
        $role = Role::create(['key' => 'rpt_'.uniqid(), 'name' => 'Report Save', 'is_system' => false]);

        $this->actingAs($editor)->putJson("/api/permissions/{$role->key}", ['permissions' => ['reports.assets', 'reports.export'], 'version' => $role->permissionsVersion()])->assertOk();

        $this->assertSame([], RolePermission::where('role_id', $role->id)->where('allowed', true)->pluck('permission')->all());
    }
}
