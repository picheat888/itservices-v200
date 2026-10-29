<?php

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DepartmentApiTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'r_'.uniqid(), 'name' => 'Role '.uniqid(), 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    public function test_creates_a_department_without_a_head_field(): void
    {
        $this->actingAs($this->super());

        $this->postJson('/api/departments', ['name' => 'Finance', 'name_th' => 'ฝ่ายการเงิน'])
            ->assertStatus(201)
            ->assertJsonPath('data.name', 'Finance')
            ->assertJsonMissingPath('data.head');

        $this->assertDatabaseHas('departments', ['name' => 'Finance']);
    }

    public function test_department_resource_no_longer_exposes_head(): void
    {
        $this->actingAs($this->super());
        Department::create(['name' => 'Operations', 'name_th' => 'ฝ่ายปฏิบัติการ']);

        $this->getJson('/api/departments')
            ->assertOk()
            ->assertJsonMissingPath('data.0.head');
    }

    public function test_updates_a_department(): void
    {
        $this->actingAs($this->super());
        $dept = Department::create(['name' => 'Sales', 'name_th' => 'ฝ่ายขาย']);

        $this->putJson("/api/departments/{$dept->id}", ['name' => 'Sales & Marketing'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Sales & Marketing');

        $this->assertSame('Sales & Marketing', $dept->fresh()->name);
    }

    public function test_department_members_need_the_department_view_or_workflow_manage(): void
    {
        $dept = Department::create(['name' => 'Finance']);
        Employee::create(['first_name' => 'A', 'last_name' => 'Member', 'department_id' => $dept->id]);
        $url = "/api/departments/{$dept->id}/members";

        $this->actingAs($this->userWith(['employees.module', 'employees.view', 'employees.view_position', 'employees.view_section']))
            ->getJson($url)->assertForbidden();
        $this->actingAs($this->userWith(['employees.module', 'employees.view_department']))
            ->getJson($url)->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($this->userWith(['workflows.module', 'workflows.manage']))
            ->getJson($url)->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($this->userWith(['workflows.module']))
            ->getJson($url)->assertOk()->assertJsonCount(1, 'data');
    }
}
