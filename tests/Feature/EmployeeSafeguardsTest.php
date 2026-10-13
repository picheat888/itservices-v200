<?php

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Section;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Employee actions that must not reach past the caller's own rights: an Administrator's account and
 * resignation, status changes through the edit form, and moving a populated section between departments.
 */
class EmployeeSafeguardsTest extends TestCase
{
    use RefreshDatabase;

    /** @param list<string> $permissions */
    private function userWith(array $permissions, array $attributes = []): User
    {
        $role = Role::create(['key' => 'r_'.uniqid(), 'name' => 'Role '.uniqid(), 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key, ...$attributes]);
    }

    private function employeeWithAccount(User $account): Employee
    {
        $employee = Employee::create(['first_name' => 'Target', 'last_name' => 'Person', 'status' => 'active']);
        $account->update(['employee_id' => $employee->id]);

        return $employee;
    }

    public function test_a_password_reset_works_on_any_account_but_an_administrator(): void
    {
        $support = $this->userWith(['employees.reset_password', 'employees.view']);
        $supervisor = $this->userWith(['employees.reset_password', 'system.manage_permissions']);
        $employee = $this->employeeWithAccount($supervisor);

        $this->actingAs($support)
            ->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true, 'password' => 'NewPass#2026'])
            ->assertOk();

        $this->assertTrue(Hash::check('NewPass#2026', $supervisor->fresh()->password));
    }

    public function test_an_administrator_account_cannot_be_reset_or_resigned_by_a_non_administrator(): void
    {
        $hr = $this->userWith(['employees.resign', 'employees.reset_password', 'employees.set_credentials', 'employees.view']);
        $admin = User::factory()->create(['role' => 'super', 'password' => Hash::make('Original#2026')]);
        $employee = $this->employeeWithAccount($admin);

        $this->actingAs($hr)
            ->putJson("/api/employees/{$employee->id}/credentials", ['reset_password' => true, 'password' => 'Attacker#2026'])
            ->assertForbidden()
            ->assertJson(['message' => 'super_account']);
        $this->actingAs($hr)
            ->putJson("/api/employees/{$employee->id}/credentials", ['username' => 'renamed'])
            ->assertForbidden();
        $this->actingAs($hr)
            ->postJson("/api/employees/{$employee->id}/resign", ['reason' => 'x'])
            ->assertForbidden()
            ->assertJson(['message' => 'super_account']);

        $this->assertSame('active', $employee->fresh()->status->value);
        $this->assertTrue(Hash::check('Original#2026', $admin->fresh()->password));
        $this->assertNotSame('renamed', $admin->fresh()->username);
    }

    public function test_resigning_someone_already_resigned_is_refused(): void
    {
        $hr = $this->userWith(['employees.resign', 'employees.view']);
        $employee = Employee::create(['first_name' => 'Gone', 'last_name' => 'Already', 'status' => 'resigned', 'resign_reason' => 'first']);

        $this->actingAs($hr)
            ->postJson("/api/employees/{$employee->id}/resign", ['reason' => 'second'])
            ->assertStatus(422)
            ->assertJson(['message' => 'already_resigned']);

        $this->assertSame('first', $employee->fresh()->resign_reason);
    }

    public function test_the_edit_form_cannot_change_employment_status(): void
    {
        $editor = $this->userWith(['employees.edit', 'employees.view']);
        $employee = Employee::create(['first_name' => 'Still', 'last_name' => 'Here', 'status' => 'active']);

        $this->actingAs($editor)
            ->putJson("/api/employees/{$employee->id}", ['first_name' => 'Still', 'last_name' => 'Here', 'status' => 'resigned'])
            ->assertOk();

        $this->assertSame('active', $employee->fresh()->status->value);
    }

    public function test_a_section_with_members_stays_in_its_department(): void
    {
        $editor = $this->userWith(['employees.section_edit']);
        $it = Department::create(['code' => 'DEP-1', 'name' => 'IT']);
        $hr = Department::create(['code' => 'DEP-2', 'name' => 'HR']);
        $support = Section::create(['code' => 'SEC-1', 'department_id' => $it->id, 'name' => 'Support']);
        $empty = Section::create(['code' => 'SEC-2', 'department_id' => $it->id, 'name' => 'Empty']);
        Employee::create(['first_name' => 'A', 'last_name' => 'B', 'department_id' => $it->id, 'section_id' => $support->id]);

        $this->actingAs($editor)
            ->putJson("/api/sections/{$support->id}", ['department_id' => $hr->id, 'name' => 'Support'])
            ->assertStatus(422)
            ->assertJson(['message' => 'section_has_employees_move', 'employees_count' => 1]);
        $this->actingAs($editor)
            ->putJson("/api/sections/{$support->id}", ['department_id' => $it->id, 'name' => 'Support desk'])
            ->assertOk();
        $this->actingAs($editor)
            ->putJson("/api/sections/{$empty->id}", ['department_id' => $hr->id, 'name' => 'Empty'])
            ->assertOk();

        $this->assertSame($it->id, $support->fresh()->department_id);
        $this->assertSame($hr->id, $empty->fresh()->department_id);
    }

    public function test_the_employee_record_names_a_manager_who_has_resigned(): void
    {
        $viewer = $this->userWith(['employees.view']);
        $manager = Employee::create(['first_name' => 'Old', 'last_name' => 'Boss', 'first_name_th' => 'หัวหน้า', 'last_name_th' => 'เก่า', 'status' => 'resigned']);
        $employee = Employee::create(['first_name' => 'Team', 'last_name' => 'Member', 'manager_id' => $manager->id]);

        $this->actingAs($viewer)
            ->getJson("/api/employees/{$employee->id}")
            ->assertOk()
            ->assertJsonPath('data.manager_name', 'Old Boss')
            ->assertJsonPath('data.manager_name_th', 'หัวหน้า เก่า');
    }
}
