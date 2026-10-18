<?php

// Security tests for the Permission module: strict role keys, privilege-escalation guards.

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Employee\EmployeeImportService;
use App\Services\Employee\EmployeeService;
use App\Support\RoleKeys;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        Role::create(['key' => 'staff', 'name' => 'Staff', 'is_system' => false]);
    }

    /** Creates a non-super user and grants it the given permission keys. */
    private function userWith(string ...$permissions): User
    {
        $user = User::factory()->create(['role' => 'staff']);
        $staffRole = Role::where('key', 'staff')->first();
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $staffRole->id, 'permission' => $permission, 'allowed' => true]);
        }

        return $user;
    }

    public function test_role_keys_resolver_matches_exactly(): void
    {
        $this->assertSame('super', RoleKeys::find('super')?->key);
        $this->assertNull(RoleKeys::find('SUPER'));
        $this->assertNull(RoleKeys::find('Super'));
        $this->assertNull(RoleKeys::find(null));
        $this->assertNull(RoleKeys::find(''));
    }

    public function test_role_key_case_variant_is_refused_for_group_writes(): void
    {
        $employee = Employee::create(['first_name' => 'Eve', 'last_name' => 'Caller', 'email' => 'eve@inaba.co.th']);
        $caller = $this->userWith('system.manage_groups');
        $caller->update(['employee_id' => $employee->id]);
        $this->actingAs($caller);
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $ordinary->employees()->sync([$employee->id]);
        $auditBefore = AuditLog::count();

        foreach (['SUPER', 'Super'] as $variant) {
            $this->postJson('/api/group-roles', ['name' => 'Sneaky', 'role' => $variant, 'employee_ids' => [$employee->id]])
                ->assertUnprocessable();

            $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => $variant, 'employee_ids' => [$employee->id]])
                ->assertUnprocessable();
        }

        $this->assertDatabaseMissing('group_roles', ['name' => 'Sneaky']);
        $this->assertSame('staff', $ordinary->fresh()->role->key);
        $this->assertSame([$employee->id], $ordinary->employees()->pluck('employees.id')->all());
        $this->assertFalse($caller->fresh()->isSuper());
        $this->assertSame('staff', $caller->fresh()->role->key);
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_numeric_role_value_is_refused_not_stored_as_null(): void
    {
        $this->actingAs($this->userWith('system.manage_groups'));

        $this->postJson('/api/group-roles', ['name' => 'Numeric', 'role' => '0'])
            ->assertUnprocessable();

        $this->assertDatabaseMissing('group_roles', ['name' => 'Numeric']);
    }

    public function test_exact_super_key_is_still_refused_for_permission_save(): void
    {
        $this->actingAs($this->userWith('system.manage_roles'));

        $this->putJson('/api/permissions/super', ['permissions' => ['system.manage_roles']])
            ->assertUnprocessable();
    }

    public function test_super_group_cannot_be_the_default_for_anyone(): void
    {
        $superGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        AppSetting::put('default_employee_group_id', (string) $ordinary->id);
        $auditBefore = AuditLog::count();

        foreach ([$this->userWith('system.manage_groups'), User::factory()->create(['role' => 'super'])] as $caller) {
            $this->actingAs($caller)
                ->putJson('/api/group-roles-default', ['group_id' => $superGroup->id])
                ->assertUnprocessable()
                ->assertJsonPath('code', 'default_group_super');
        }

        $this->assertSame((string) $ordinary->id, (string) AppSetting::get('default_employee_group_id'));
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_orphan_does_not_fall_into_a_legacy_super_default_group(): void
    {
        $superGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        AppSetting::put('default_employee_group_id', (string) $superGroup->id);
        Role::create(['key' => 'user', 'name' => 'User', 'is_system' => false]);

        $employee = Employee::create(['first_name' => 'Olive', 'last_name' => 'Orphan', 'email' => 'olive@inaba.co.th']);
        $member = User::factory()->create(['role' => 'staff', 'employee_id' => $employee->id]);
        $ordinary->employees()->sync([$employee->id]);

        $this->actingAs($this->userWith('system.manage_groups'))
            ->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => 'staff', 'employee_ids' => []])
            ->assertOk();

        $this->assertFalse($member->fresh()->isSuper());
        $this->assertSame('user', $member->fresh()->role->key);
        $this->assertFalse($superGroup->employees()->where('employees.id', $employee->id)->exists());
    }

    public function test_new_employee_is_not_put_into_a_legacy_super_default_group(): void
    {
        $superGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        AppSetting::put('default_employee_group_id', (string) $superGroup->id);

        $employee = app(EmployeeService::class)->create(['first_name' => 'Nina', 'last_name' => 'New', 'email' => 'nina@inaba.co.th']);

        $this->assertFalse($superGroup->employees()->where('employees.id', $employee->id)->exists());
        $this->assertNull(app(EmployeeService::class)->defaultRoleForNewEmployee());
    }

    public function test_csv_import_ignores_a_legacy_super_default_group(): void
    {
        $superGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        AppSetting::put('default_employee_group_id', (string) $superGroup->id);
        $department = Department::create(['code' => 'DEP-0003', 'tag' => 'IT', 'name' => 'Information Technology']);
        Section::create(['code' => 'SEC-0002', 'department_id' => $department->id, 'name' => 'Support']);
        Position::create(['code' => 'PST-0013', 'title' => 'Staff/Officer', 'allow_special_position' => false]);
        Employee::create(['code' => 'EMP-1005', 'first_name' => 'Big', 'last_name' => 'Boss']);

        $result = app(EmployeeImportService::class)->importRows([[
            'employee_code' => '', 'first_name' => 'Cora', 'last_name' => 'Csv', 'first_name_th' => '', 'last_name_th' => '',
            'email' => '', 'phone' => '', 'department' => 'IT', 'section' => 'Support', 'position' => 'Staff/Officer',
            'joined_at' => '2024-01-15', 'report_to_employee_code' => 'EMP-1005',
        ]]);

        $this->assertSame([], $result['errors']);
        $this->assertSame(1, $result['imported']);
        $this->assertSame(0, $superGroup->employees()->count());
    }

    public function test_permission_save_needs_the_exact_role_key(): void
    {
        $this->actingAs($this->userWith('system.manage_roles'));
        $superId = Role::where('key', 'super')->value('id');

        $this->putJson('/api/permissions/SUPER', ['permissions' => ['system.manage_roles']])
            ->assertNotFound();

        $this->assertDatabaseMissing('role_permissions', ['role_id' => $superId]);
    }
}
