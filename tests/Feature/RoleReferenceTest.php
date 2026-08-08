<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class RoleReferenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_users_table_has_role_id_column(): void
    {
        $this->assertTrue(Schema::hasColumn('users', 'role_id'));
        $this->assertTrue(Schema::hasColumn('group_roles', 'role_id'));
        $this->assertTrue(Schema::hasColumn('role_permissions', 'role_id'));
    }

    public function test_user_role_relation_and_super_check_work_by_id(): void
    {
        $super = Role::create(['key' => 'super', 'name' => 'Administrator', 'color' => '#000', 'is_system' => true]);
        $staff = Role::create(['key' => 'user', 'name' => 'Staff', 'color' => '#111', 'is_system' => false]);

        $admin = User::factory()->create(['role' => 'super']);
        $plain = User::factory()->create(['role' => 'user']);

        $this->assertSame($super->id, $admin->role_id);
        $this->assertSame('super', $admin->role->key);
        $this->assertTrue($admin->isSuper());
        $this->assertFalse($plain->isSuper());
        $this->assertSame(1, $super->members());
    }

    public function test_permission_matrix_update_persists_by_role_id(): void
    {
        Role::create(['key' => 'super', 'name' => 'Admin', 'color' => '#000', 'is_system' => true]);
        $hr = Role::create(['key' => 'hr', 'name' => 'HR', 'color' => '#111', 'is_system' => false]);
        $actor = User::factory()->create(['role' => 'super']);

        // employees.* is gated by the employees.module master (see
        // Permissions::employeeHierarchy / normalizeEmployees): a child permission
        // only persists when the master is granted too. The permission matrix UI
        // always sends the master alongside any child, so include it here.
        $this->actingAs($actor)->putJson('/api/permissions/hr', [
            'permissions' => ['employees.module', 'employees.view'],
        ])->assertOk();

        $this->assertDatabaseHas('role_permissions', [
            'role_id' => $hr->id, 'permission' => 'employees.view', 'allowed' => true,
        ]);
    }

    public function test_credential_creation_uses_group_role_id(): void
    {
        Role::create(['key' => 'super', 'name' => 'Admin', 'color' => '#000', 'is_system' => true]);
        $hr = Role::create(['key' => 'hr', 'name' => 'HR', 'color' => '#111', 'is_system' => false]);

        $employee = Employee::create(['code' => 'EMP-7100', 'first_name' => 'Grouped', 'last_name' => 'Test', 'email' => 'g7100@x.test']);
        $group = GroupRole::create(['name' => 'HR Team', 'role_id' => $hr->id]);
        $group->employees()->attach($employee->id);

        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->postJson("/api/employees/{$employee->id}/credentials", [
            'username' => 'grouped', 'password' => 'Secret123!', 'password_confirmation' => 'Secret123!',
        ])->assertCreated();

        $this->assertSame($hr->id, User::where('username', 'grouped')->first()->role_id);
    }

    public function test_deleting_a_role_cascades_its_permissions(): void
    {
        Role::create(['key' => 'super', 'name' => 'Admin', 'color' => '#000', 'is_system' => true]);
        $custom = Role::create(['key' => 'tempx', 'name' => 'Temp', 'color' => '#111', 'is_system' => false]);
        RolePermission::create(['role_id' => $custom->id, 'permission' => 'employees.view', 'allowed' => true]);

        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->deleteJson('/api/roles/tempx')->assertOk();

        $this->assertDatabaseMissing('roles', ['id' => $custom->id]);
        $this->assertDatabaseMissing('role_permissions', ['role_id' => $custom->id]);
    }

    public function test_a_refused_delete_says_which_of_the_three_reasons_applies(): void
    {
        Role::create(['key' => 'super', 'name' => 'Admin', 'color' => '#000', 'is_system' => true]);
        $inUse = Role::create(['key' => 'inuse', 'name' => 'In Use', 'color' => '#111', 'is_system' => false]);
        GroupRole::create(['name' => 'All Staff', 'role_id' => $inUse->id]);
        $this->actingAs(User::factory()->create(['role' => 'super']));

        // The confirm dialog shows a 422's message verbatim, so a bare "cannot delete"
        // would leave the reader with nothing to act on.
        $this->deleteJson('/api/roles/inuse')
            ->assertStatus(422)
            ->assertJsonPath('message', 'Role is still used by a Role Group. Reassign it first.');

        $this->assertDatabaseHas('roles', ['id' => $inUse->id]);
    }

    public function test_the_matrix_counts_the_groups_using_each_role(): void
    {
        Role::create(['key' => 'super', 'name' => 'Admin', 'color' => '#000', 'is_system' => true]);
        $used = Role::create(['key' => 'used', 'name' => 'Used', 'color' => '#111', 'is_system' => false]);
        Role::create(['key' => 'spare', 'name' => 'Spare', 'color' => '#222', 'is_system' => false]);
        GroupRole::create(['name' => 'All Staff', 'role_id' => $used->id]);
        GroupRole::create(['name' => 'IT Team', 'role_id' => $used->id]);

        // The page needs this to name the blocker before opening a dialog that would
        // only be refused — it already knows about members and system roles.
        $rows = collect($this->actingAs(User::factory()->create(['role' => 'super']))
            ->getJson('/api/permissions')->assertOk()->json('data.roles'))
            ->keyBy('value');

        $this->assertSame(2, $rows['used']['groups']);
        $this->assertSame(0, $rows['spare']['groups']);
    }
}
