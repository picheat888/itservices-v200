<?php

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeePermissionGatingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** Create a non-super user holding exactly the given permissions. */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'emp_'.uniqid(), 'name' => 'Emp Test', 'is_system' => false]);
        foreach ($permissions as $p) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $p, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    public function test_save_normalizes_away_orphan_employee_children(): void
    {
        $admin = $this->admin();
        $role = Role::create(['key' => 'emp_norm', 'name' => 'Norm', 'is_system' => false]);

        // module + view present -> add kept; view_section absent -> section_add dropped
        $this->actingAs($admin)->putJson("/api/permissions/{$role->key}", [
            'permissions' => ['employees.module', 'employees.view', 'employees.add', 'employees.section_add'],
        ])->assertOk();

        $stored = RolePermission::where('role_id', $role->id)->where('allowed', true)->pluck('permission')->all();
        $this->assertContains('employees.add', $stored);
        $this->assertNotContains('employees.section_add', $stored);
    }

    public function test_save_preserves_edit_own_without_master(): void
    {
        $admin = $this->admin();
        $role = Role::create(['key' => 'emp_own', 'name' => 'Own', 'is_system' => false]);

        $this->actingAs($admin)->putJson("/api/permissions/{$role->key}", [
            'permissions' => ['employees.edit_own'],
        ])->assertOk();

        $stored = RolePermission::where('role_id', $role->id)->where('allowed', true)->pluck('permission')->all();
        $this->assertContains('employees.edit_own', $stored);
    }

    public function test_section_store_requires_section_add(): void
    {
        $dept = Department::create(['name' => 'IT', 'tag' => 'IT']);
        $blocked = $this->userWith(['employees.module', 'employees.view_section']);
        $allowed = $this->userWith(['employees.module', 'employees.view_section', 'employees.section_add']);

        $payload = ['department_id' => $dept->id, 'name' => 'Helpdesk'];
        $this->actingAs($blocked)->postJson('/api/sections', $payload)->assertForbidden();
        $this->actingAs($allowed)->postJson('/api/sections', $payload)->assertCreated();
    }

    public function test_department_delete_requires_department_delete(): void
    {
        $dept = Department::create(['name' => 'Temp', 'tag' => 'TMP']);
        $blocked = $this->userWith(['employees.module', 'employees.view_department']);
        $this->actingAs($blocked)->deleteJson("/api/departments/{$dept->id}")->assertForbidden();

        $allowed = $this->userWith(['employees.module', 'employees.view_department', 'employees.department_delete']);
        $this->actingAs($allowed)->deleteJson("/api/departments/{$dept->id}")->assertOk();
    }

    public function test_position_special_toggle_requires_position_special(): void
    {
        $pos = Position::create(['title' => 'Dev', 'allow_special_position' => false]);
        // Has edit but not special -> may rename, may NOT flip allow_special_position
        $editor = $this->userWith(['employees.module', 'employees.view_position', 'employees.position_edit']);
        $this->actingAs($editor)
            ->putJson("/api/positions/{$pos->id}", ['title' => 'Dev', 'allow_special_position' => true])
            ->assertForbidden();

        $special = $this->userWith(['employees.module', 'employees.view_position', 'employees.position_edit', 'employees.position_special']);
        $this->actingAs($special)
            ->putJson("/api/positions/{$pos->id}", ['title' => 'Dev', 'allow_special_position' => true])
            ->assertOk();
    }

    public function test_reference_reads_stay_open_for_any_authenticated_user(): void
    {
        // A user with NO employee permissions can still read the dropdown lists.
        $picker = $this->userWith(['tickets.create']);
        $this->actingAs($picker)->getJson('/api/departments')->assertOk();
        $this->actingAs($picker)->getJson('/api/positions')->assertOk();
        $this->actingAs($picker)->getJson('/api/sections')->assertOk();
    }

    public function test_summary_requires_view_dashboard(): void
    {
        $blocked = $this->userWith(['employees.module', 'employees.view']);
        $allowed = $this->userWith(['employees.module', 'employees.view_dashboard']);
        $this->actingAs($blocked)->getJson('/api/employees/summary')->assertForbidden();
        $this->actingAs($allowed)->getJson('/api/employees/summary')->assertOk();
    }

    public function test_summary_reports_status_hires_and_resignations(): void
    {
        $allowed = $this->userWith(['employees.module', 'employees.view_dashboard']);

        Employee::create(['first_name' => 'A', 'last_name' => 'One', 'status' => 'active', 'joined_at' => now()->subMonths(2)->toDateString()]);
        Employee::create(['first_name' => 'B', 'last_name' => 'Two', 'status' => 'active', 'joined_at' => now()->subMonth()->toDateString()]);
        Employee::create([
            'first_name' => 'Gone', 'last_name' => 'Away', 'status' => 'resigned',
            'joined_at' => now()->subYears(2)->toDateString(), 'last_day' => now()->startOfYear()->addMonths(3)->toDateString(),
        ]);

        $res = $this->actingAs($allowed)->getJson('/api/employees/summary')->assertOk();

        $res->assertJsonPath('total', 3)
            ->assertJsonPath('active', 2)
            ->assertJsonPath('resigned', 1)
            ->assertJsonPath('resigned_this_year', 1)
            ->assertJsonPath('recent_resignations.0.name', 'Gone Away')
            ->assertJsonPath('recent_resignations.0.status', 'resigned');

        // hires_by_month: a continuous, zero-filled series ending at the current month.
        $months = $res->json('hires_by_month');
        $this->assertNotEmpty($months);
        $this->assertArrayHasKey('month', $months[0]);
        $this->assertSame(now()->format('Y-m'), end($months)['month']);
    }

    public function test_summary_counts_active_employees_without_a_login_account(): void
    {
        $allowed = $this->userWith(['employees.module', 'employees.view_dashboard']);

        $linked = Employee::create(['first_name' => 'Has', 'last_name' => 'Account', 'status' => 'active']);
        User::factory()->create(['employee_id' => $linked->id]);
        Employee::create(['first_name' => 'Needs', 'last_name' => 'Account', 'status' => 'active']);
        // Resigned staff are excluded — they are not waiting for an account.
        Employee::create(['first_name' => 'Gone', 'last_name' => 'Away', 'status' => 'resigned']);

        $this->actingAs($allowed)->getJson('/api/employees/summary')
            ->assertOk()
            ->assertJsonPath('no_account', 1);
    }

    public function test_org_chart_requires_view_org(): void
    {
        $blocked = $this->userWith(['employees.module', 'employees.view']);
        $allowed = $this->userWith(['employees.module', 'employees.view_org']);
        $this->actingAs($blocked)->getJson('/api/employees/org-chart')->assertForbidden();
        $this->actingAs($allowed)->getJson('/api/employees/org-chart')->assertOk();
    }

    public function test_directory_browse_requires_view_but_picker_stays_open(): void
    {
        $picker = $this->userWith(['tickets.create']); // no employee perms
        // Paginated directory browse is gated
        $this->actingAs($picker)->getJson('/api/employees?page=1')->assertForbidden();
        // Unpaginated picker list stays open
        $this->actingAs($picker)->getJson('/api/employees')->assertOk();

        $viewer = $this->userWith(['employees.module', 'employees.view']);
        $this->actingAs($viewer)->getJson('/api/employees?page=1')->assertOk();
    }
}
