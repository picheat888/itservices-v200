<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\GroupRole;
use App\Models\Role;
use App\Models\RolePermission;
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

        $this->actingAs($actor)->putJson('/api/permissions/hr', [
            'permissions' => ['employees.view'],
        ])->assertOk();

        $this->assertDatabaseHas('role_permissions', [
            'role_id' => $hr->id, 'permission' => 'employees.view', 'allowed' => true,
        ]);
    }

    public function test_credential_creation_uses_group_role_id(): void
    {
        Role::create(['key' => 'super', 'name' => 'Admin', 'color' => '#000', 'is_system' => true]);
        $hr = Role::create(['key' => 'hr', 'name' => 'HR', 'color' => '#111', 'is_system' => false]);

        $employee = Employee::create(['code' => 'EMP-7100', 'name' => 'Grouped', 'email' => 'g7100@x.test']);
        $group = GroupRole::create(['name' => 'HR Team', 'role_id' => $hr->id]);
        $group->employees()->attach($employee->id);

        $this->actingAs(User::factory()->create(['role' => 'super']));
        $this->postJson("/api/employees/{$employee->id}/credentials", [
            'username' => 'grouped', 'password' => 'secret123', 'password_confirmation' => 'secret123',
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
}
