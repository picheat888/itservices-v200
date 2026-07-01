<?php

namespace Tests\Feature;

use App\Models\Access\EmailGroup;
use App\Models\Employee;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeeAccessTest extends TestCase
{
    use RefreshDatabase;

    /** Seed each role's default permissions into role_permissions (mirrors DatabaseSeeder). */
    protected function seedDefaultPermissions(): void
    {
        foreach (Permissions::defaults() as $roleKey => $granted) {
            $roleId = Role::firstOrCreate(['key' => $roleKey], ['name' => ucfirst($roleKey)])->id;
            foreach ($granted as $permission) {
                RolePermission::updateOrCreate(
                    ['role_id' => $roleId, 'permission' => $permission],
                    ['allowed' => true],
                );
            }
        }
    }

    public function test_employee_access_endpoint_groups_active_memberships(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B']);
        $g->memberships()->create(['employee_id' => $e->id, 'access_level' => 'Member', 'granted_at' => '2026-01-01']);

        $this->getJson("/api/employees/{$e->id}/access")
            ->assertOk()
            ->assertJsonCount(1, 'data.email_groups')
            ->assertJsonPath('data.outstanding', false);
    }

    public function test_resigned_employee_access_is_flagged_outstanding(): void
    {
        $this->seedDefaultPermissions();
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $g = EmailGroup::create(['name' => 'QA', 'email' => 'qa@x.co']);
        $e = Employee::create(['first_name' => 'A', 'last_name' => 'B', 'status' => 'resigned']);
        $g->memberships()->create(['employee_id' => $e->id, 'access_level' => 'Member', 'granted_at' => '2026-01-01']);

        $this->getJson("/api/employees/{$e->id}/access")->assertOk()->assertJsonPath('data.outstanding', true);
    }
}
