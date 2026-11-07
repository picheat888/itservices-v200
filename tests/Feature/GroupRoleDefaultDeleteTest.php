<?php

// The default Role Group cannot be deleted by anyone; it can once another group (or none) is the default.

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GroupRoleDefaultDeleteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['key' => 'super', 'name' => 'Administrator', 'color' => '#ef4444', 'is_system' => true]);
        Role::create(['key' => 'user', 'name' => 'Staff', 'is_system' => false]);
        Role::create(['key' => 'admin', 'name' => 'IT Support', 'color' => '#3b82f6', 'is_system' => false]);
    }

    private function manager(): User
    {
        $role = Role::create(['key' => 'clerk', 'name' => 'Clerk', 'is_system' => false]);
        RolePermission::create(['role_id' => $role->id, 'permission' => 'system.manage_groups', 'allowed' => true]);

        return User::factory()->create(['role' => 'clerk']);
    }

    /** @return array{0: GroupRole, 1: Employee} */
    private function defaultGroupWithMember(): array
    {
        $group = GroupRole::create(['name' => 'Everyone', 'role' => 'admin']);
        $employee = Employee::create(['first_name' => 'Sam', 'last_name' => 'Test']);
        User::factory()->create(['role' => 'admin', 'employee_id' => $employee->id]);
        $group->employees()->attach($employee->id);
        AppSetting::put('default_employee_group_id', (string) $group->id);

        return [$group, $employee];
    }

    private function assertRefusedAndUntouched(GroupRole $group, Employee $employee): void
    {
        $this->deleteJson("/api/group-roles/{$group->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'default_group_delete');

        $this->assertNotNull(GroupRole::find($group->id));
        $this->assertSame((string) $group->id, AppSetting::get('default_employee_group_id'));
        $this->assertSame([$employee->id], $group->employees()->pluck('employees.id')->all());
    }

    public function test_the_default_group_cannot_be_deleted(): void
    {
        [$group, $employee] = $this->defaultGroupWithMember();
        $this->actingAs($this->manager());

        $this->assertRefusedAndUntouched($group, $employee);
    }

    public function test_a_super_admin_cannot_delete_the_default_group_either(): void
    {
        [$group, $employee] = $this->defaultGroupWithMember();
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->assertRefusedAndUntouched($group, $employee);
    }

    public function test_a_legacy_super_default_group_is_deletable_and_clears_the_setting(): void
    {
        $group = GroupRole::create(['name' => 'Legacy', 'role' => 'super']);
        AppSetting::put('default_employee_group_id', (string) $group->id);
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->deleteJson("/api/group-roles/{$group->id}")->assertOk();

        $this->assertNull(GroupRole::find($group->id));
        $this->assertEmpty(AppSetting::get('default_employee_group_id'));
    }

    public function test_the_default_group_the_caller_sits_in_is_refused_as_default_first(): void
    {
        [$group, $employee] = $this->defaultGroupWithMember();
        $caller = User::where('employee_id', $employee->id)->first();
        RolePermission::create(['role_id' => Role::where('key', 'admin')->value('id'), 'permission' => 'system.manage_groups', 'allowed' => true]);
        $this->actingAs($caller);

        $this->assertRefusedAndUntouched($group, $employee);
    }

    public function test_a_group_is_deletable_once_it_is_no_longer_the_default(): void
    {
        [$group, $employee] = $this->defaultGroupWithMember();
        AppSetting::put('default_employee_group_id', null);
        $this->actingAs($this->manager());

        $this->deleteJson("/api/group-roles/{$group->id}")->assertOk();

        $this->assertNull(GroupRole::find($group->id));
        $this->assertSame('user', User::where('employee_id', $employee->id)->first()->role?->key);
    }
}
