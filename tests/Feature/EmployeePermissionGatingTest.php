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

    public function test_save_preserves_profile_keys_without_any_master(): void
    {
        $admin = $this->admin();
        $role = Role::create(['key' => 'emp_own', 'name' => 'Own', 'is_system' => false]);

        $this->actingAs($admin)->putJson("/api/permissions/{$role->key}", [
            'permissions' => ['profile.edit', 'profile.return_assets'],
        ])->assertOk();

        $stored = RolePermission::where('role_id', $role->id)->where('allowed', true)->pluck('permission')->all();
        $this->assertContains('profile.edit', $stored);
        $this->assertContains('profile.return_assets', $stored);
    }

    public function test_the_retired_edit_own_key_is_rejected(): void
    {
        $role = Role::create(['key' => 'emp_old', 'name' => 'Old', 'is_system' => false]);

        $this->actingAs($this->admin())->putJson("/api/permissions/{$role->key}", [
            'permissions' => ['employees.edit_own'],
        ])->assertUnprocessable();
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
        $this->travelTo('2026-10-14 12:00:00');
        $allowed = $this->userWith(['employees.module', 'employees.view_dashboard']);

        Employee::create(['first_name' => 'A', 'last_name' => 'One', 'status' => 'active', 'joined_at' => '2026-08-03']);
        Employee::create(['first_name' => 'B', 'last_name' => 'Two', 'status' => 'active', 'joined_at' => '2026-10-01']);
        Employee::create([
            'first_name' => 'Gone', 'last_name' => 'Away', 'status' => 'resigned',
            'joined_at' => '2024-05-02', 'last_day' => '2026-04-30',
        ]);

        // All time (no params): every hire and leaver, the chart from the first hire.
        $res = $this->actingAs($allowed)->getJson('/api/employees/summary')->assertOk();
        $res->assertJsonPath('total', 3)
            ->assertJsonPath('active', 2)
            ->assertJsonPath('resigned', 1)
            ->assertJsonPath('new_hires', 3)
            ->assertJsonPath('resigned_in_period', 1)
            ->assertJsonPath('recent_resignations.0.name', 'Gone Away')
            ->assertJsonPath('recent_resignations.0.status', 'resigned')
            ->assertJsonPath('hires_trend.unit', 'year');
        $years = $res->json('hires_trend.data');
        $this->assertSame(['2024', '2025', '2026'], array_column($years, 'month'));
        $this->assertSame([1, 0, 2], array_column($years, 'count'));

        // The last 30 days: one hire, no leaver; headcount and status stay as of now.
        $this->getJson('/api/employees/summary?days=30')->assertOk()
            ->assertJsonPath('total', 3)
            ->assertJsonPath('resigned', 1)
            ->assertJsonPath('new_hires', 1)
            ->assertJsonPath('resigned_in_period', 0)
            ->assertJsonCount(1, 'recent')
            ->assertJsonCount(0, 'recent_resignations')
            ->assertJsonPath('hires_trend.unit', 'week');
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

    /** The picker list stays open for other modules — but only with what a picker needs. */
    public function test_the_open_picker_list_carries_no_personal_details(): void
    {
        $someone = Employee::create([
            'code' => 'EMP-777', 'first_name' => 'Somchai', 'last_name' => 'Private', 'email' => 'somchai@example.test',
            'phone' => '081-000-0000', 'username' => 'somchai', 'joined_at' => '2024-02-01',
            'status' => 'resigned', 'resign_reason' => 'Personal matters', 'last_day' => '2026-09-30',
        ]);
        $personal = ['email', 'phone', 'username', 'joined_at', 'resign_reason', 'last_day'];

        $row = collect($this->actingAs($this->userWith(['tickets.create']))->getJson('/api/employees')->assertOk()->json('data'))
            ->firstWhere('id', $someone->id);
        $this->assertSame('Somchai Private', $row['name']);
        $this->assertSame('EMP-777', $row['code']);
        $this->assertSame('resigned', $row['status']);
        foreach ($personal as $field) {
            $this->assertNull($row[$field], $field);
        }

        $full = collect($this->actingAs($this->userWith(['employees.module', 'employees.view']))->getJson('/api/employees')->json('data'))
            ->firstWhere('id', $someone->id);
        $this->assertSame('somchai@example.test', $full['email']);
        $this->assertSame('Personal matters', $full['resign_reason']);
    }

    public function test_one_employee_record_needs_view_unless_it_is_your_own(): void
    {
        $other = Employee::create(['first_name' => 'Other', 'last_name' => 'Person', 'email' => 'other@example.test']);
        $me = Employee::create(['first_name' => 'Me', 'last_name' => 'Myself', 'email' => 'me@example.test']);
        $user = $this->userWith(['tickets.create']);
        $user->update(['employee_id' => $me->id]);

        $this->actingAs($user)->getJson("/api/employees/{$other->id}")->assertForbidden();
        $this->actingAs($user)->getJson("/api/employees/{$me->id}")->assertOk()->assertJsonPath('data.email', 'me@example.test');
        $this->actingAs($this->userWith(['employees.module', 'employees.view']))
            ->getJson("/api/employees/{$other->id}")->assertOk()->assertJsonPath('data.email', 'other@example.test');
    }
}
