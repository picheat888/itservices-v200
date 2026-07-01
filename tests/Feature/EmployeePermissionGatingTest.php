<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\RolePermission;
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
}
