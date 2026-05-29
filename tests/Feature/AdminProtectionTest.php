<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\GroupRole;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Guards that keep non-super (non-Administrator) users from touching the
 * Administrator role: editing an admin's employee record, demoting an admin
 * via role groups, or escalating anyone to the super role.
 */
class AdminProtectionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        Role::create(['key' => 'staff', 'name' => 'Staff', 'is_system' => false]);
    }

    /** Creates a super (Administrator) login account. */
    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** Creates a non-super user and grants it the given permission keys. */
    private function userWith(string ...$permissions): User
    {
        $user = User::factory()->create(['role' => 'staff']);
        foreach ($permissions as $permission) {
            RolePermission::create(['role' => 'staff', 'permission' => $permission, 'allowed' => true]);
        }

        return $user;
    }

    public function test_non_super_with_edit_permission_cannot_edit_an_admin_employee(): void
    {
        $adminEmployee = Employee::create(['name' => 'Boss', 'email' => 'boss@inaba.co.th']);
        User::factory()->create(['role' => 'super', 'email' => 'boss@inaba.co.th', 'employee_id' => $adminEmployee->id]);

        $this->actingAs($this->userWith('employees.edit'));

        $this->putJson("/api/employees/{$adminEmployee->id}", ['name' => 'Hacked'])
            ->assertForbidden();

        $this->assertDatabaseHas('employees', ['id' => $adminEmployee->id, 'name' => 'Boss']);
    }

    public function test_super_can_edit_an_admin_employee(): void
    {
        $adminEmployee = Employee::create(['name' => 'Boss', 'email' => 'boss@inaba.co.th']);
        User::factory()->create(['role' => 'super', 'email' => 'boss@inaba.co.th', 'employee_id' => $adminEmployee->id]);

        $this->actingAs($this->super());

        $this->putJson("/api/employees/{$adminEmployee->id}", ['name' => 'Boss Renamed'])
            ->assertOk();

        $this->assertDatabaseHas('employees', ['id' => $adminEmployee->id, 'name' => 'Boss Renamed']);
    }

    public function test_non_super_with_edit_permission_can_still_edit_a_normal_employee(): void
    {
        $normal = Employee::create(['name' => 'Regular Joe', 'email' => 'joe@inaba.co.th']);

        $this->actingAs($this->userWith('employees.edit'));

        $this->putJson("/api/employees/{$normal->id}", ['name' => 'Joe Updated'])
            ->assertOk();

        $this->assertDatabaseHas('employees', ['id' => $normal->id, 'name' => 'Joe Updated']);
    }

    public function test_non_super_cannot_create_a_group_with_the_super_role(): void
    {
        $this->actingAs($this->userWith('system.manage_groups'));

        $this->postJson('/api/group-roles', ['name' => 'Sneaky', 'role' => 'super'])
            ->assertForbidden();

        $this->assertDatabaseMissing('group_roles', ['name' => 'Sneaky']);
    }

    public function test_non_super_cannot_modify_the_admin_group(): void
    {
        $group = GroupRole::create(['name' => 'Admins', 'role' => 'super']);

        $this->actingAs($this->userWith('system.manage_groups'));

        $this->putJson("/api/group-roles/{$group->id}", ['name' => 'Admins', 'role' => 'super', 'employee_ids' => []])
            ->assertForbidden();
    }

    public function test_non_super_cannot_delete_the_admin_group(): void
    {
        $group = GroupRole::create(['name' => 'Admins', 'role' => 'super']);

        $this->actingAs($this->userWith('system.manage_groups'));

        $this->deleteJson("/api/group-roles/{$group->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('group_roles', ['id' => $group->id]);
    }

    public function test_super_can_manage_the_admin_group(): void
    {
        $group = GroupRole::create(['name' => 'Admins', 'role' => 'super']);

        $this->actingAs($this->super());

        $this->putJson("/api/group-roles/{$group->id}", ['name' => 'Administrators', 'role' => 'super', 'employee_ids' => []])
            ->assertOk();

        $this->assertDatabaseHas('group_roles', ['id' => $group->id, 'name' => 'Administrators']);
    }
}
