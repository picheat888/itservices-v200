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

    /**
     * Creates an employee whose login account is a Super admin, linked by employee_id or by username.
     *
     * @return array{0: Employee, 1: User}
     */
    private function superAdminEmployee(string $firstName, ?GroupRole $group = null, bool $linkByUsername = false): array
    {
        $username = strtolower($firstName);
        $employee = Employee::create([
            'first_name' => $firstName,
            'last_name' => 'Admin',
            'email' => "{$username}@inaba.co.th",
            'username' => $linkByUsername ? $username : null,
        ]);
        $account = User::factory()->create($linkByUsername
            ? ['role' => 'super', 'username' => $username]
            : ['role' => 'super', 'employee_id' => $employee->id]);
        $group?->employees()->attach($employee->id);

        return [$employee, $account];
    }

    /** Creates an employee with a staff login account inside the given group. */
    private function staffEmployee(string $firstName, GroupRole $group): Employee
    {
        $employee = Employee::create(['first_name' => $firstName, 'last_name' => 'Staff', 'email' => strtolower($firstName).'@inaba.co.th']);
        User::factory()->create(['role' => 'staff', 'employee_id' => $employee->id]);
        $group->employees()->attach($employee->id);

        return $employee;
    }

    private function isMember(GroupRole $group, Employee $employee): bool
    {
        return $group->employees()->where('employees.id', $employee->id)->exists();
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

    public function test_index_reports_no_default_when_a_legacy_super_group_is_stored(): void
    {
        $superGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        AppSetting::put('default_employee_group_id', (string) $superGroup->id);

        $this->actingAs($this->userWith('system.manage_groups'))
            ->getJson('/api/group-roles')
            ->assertOk()
            ->assertJsonPath('default_group_id', null);
    }

    public function test_login_account_is_refused_rather_than_given_a_legacy_super_default(): void
    {
        $superGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        AppSetting::put('default_employee_group_id', (string) $superGroup->id);
        $employee = Employee::create(['first_name' => 'Gina', 'last_name' => 'Groupless', 'email' => 'gina@inaba.co.th']);

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->postJson("/api/employees/{$employee->id}/credentials", ['username' => 'gina_g', 'password' => 'Str0ng!Passw0rd#1', 'password_confirmation' => 'Str0ng!Passw0rd#1'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.role.0', 'no_role_configured');

        $this->assertDatabaseMissing('users', ['username' => 'gina_g']);
    }

    public function test_orphan_does_not_land_in_a_default_group_that_later_became_super(): void
    {
        Role::create(['key' => 'user', 'name' => 'User', 'is_system' => false]);
        $defaultGroup = GroupRole::create(['name' => 'Everyone', 'role' => 'staff']);
        $other = GroupRole::create(['name' => 'Other', 'role' => 'staff']);
        $superCaller = User::factory()->create(['role' => 'super']);
        $this->actingAs($superCaller)->putJson('/api/group-roles-default', ['group_id' => $defaultGroup->id])->assertOk();

        $this->putJson("/api/group-roles/{$defaultGroup->id}", ['name' => 'Everyone', 'role' => 'super', 'employee_ids' => []])->assertOk();

        $employee = Employee::create(['first_name' => 'Pat', 'last_name' => 'Orphan', 'email' => 'pat@inaba.co.th']);
        $member = User::factory()->create(['role' => 'staff', 'employee_id' => $employee->id]);
        $other->employees()->sync([$employee->id]);

        $this->putJson("/api/group-roles/{$other->id}", ['name' => 'Other', 'role' => 'staff', 'employee_ids' => []])->assertOk();

        $this->assertFalse($defaultGroup->employees()->where('employees.id', $employee->id)->exists());
        $this->assertFalse($member->fresh()->isSuper());
    }

    public function test_permission_save_needs_the_exact_role_key(): void
    {
        $this->actingAs($this->userWith('system.manage_roles'));
        $superId = Role::where('key', 'super')->value('id');

        $this->putJson('/api/permissions/SUPER', ['permissions' => ['system.manage_roles']])
            ->assertNotFound();

        $this->assertDatabaseMissing('role_permissions', ['role_id' => $superId]);
    }

    public function test_non_super_cannot_pull_a_super_admin_into_a_new_group(): void
    {
        $adminGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada', $adminGroup);
        $this->actingAs($this->userWith('system.manage_groups'));
        $auditBefore = AuditLog::count();

        $this->postJson('/api/group-roles', ['name' => 'Staff', 'role' => 'staff', 'employee_ids' => [$adminEmployee->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'admin_members_protected');

        $this->assertDatabaseMissing('group_roles', ['name' => 'Staff']);
        $this->assertTrue($this->isMember($adminGroup, $adminEmployee));
        $this->assertTrue($admin->fresh()->isSuper());
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_non_super_cannot_add_a_super_admin_to_an_ordinary_group(): void
    {
        $adminGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada', $adminGroup);
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $staff = $this->staffEmployee('Sam', $ordinary);
        $this->actingAs($this->userWith('system.manage_groups'));
        $auditBefore = AuditLog::count();

        $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => 'staff', 'employee_ids' => [$staff->id, $adminEmployee->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'admin_members_protected');

        $this->assertTrue($this->isMember($adminGroup, $adminEmployee));
        $this->assertFalse($this->isMember($ordinary, $adminEmployee));
        $this->assertTrue($admin->fresh()->isSuper());
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_non_super_cannot_remove_a_super_admin_from_an_ordinary_group(): void
    {
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $staff = $this->staffEmployee('Sam', $ordinary);
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada', $ordinary, linkByUsername: true);
        $this->actingAs($this->userWith('system.manage_groups'));
        $auditBefore = AuditLog::count();

        $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => 'staff', 'employee_ids' => [$staff->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'admin_members_protected');

        $this->assertTrue($this->isMember($ordinary, $adminEmployee));
        $this->assertTrue($admin->fresh()->isSuper());
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_non_super_cannot_delete_a_group_that_holds_a_super_admin(): void
    {
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada', $ordinary);
        $this->actingAs($this->userWith('system.manage_groups'));
        $auditBefore = AuditLog::count();

        $this->deleteJson("/api/group-roles/{$ordinary->id}")
            ->assertForbidden()
            ->assertJsonPath('code', 'admin_members_protected');

        $this->assertDatabaseHas('group_roles', ['id' => $ordinary->id]);
        $this->assertTrue($this->isMember($ordinary, $adminEmployee));
        $this->assertTrue($admin->fresh()->isSuper());
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_non_super_cannot_resave_a_group_whose_members_include_a_super_admin(): void
    {
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $staff = $this->staffEmployee('Sam', $ordinary);
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada', $ordinary);
        $this->actingAs($this->userWith('system.manage_groups'));
        $auditBefore = AuditLog::count();

        $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary Team', 'role' => 'staff', 'employee_ids' => [$staff->id, $adminEmployee->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'admin_members_protected');

        $this->assertSame('Ordinary', $ordinary->fresh()->name);
        $this->assertTrue($admin->fresh()->isSuper());
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_last_super_admin_cannot_be_removed_from_the_administrator_group(): void
    {
        $adminGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada', $adminGroup);
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        AppSetting::put('default_employee_group_id', (string) $ordinary->id);
        $auditBefore = AuditLog::count();

        $this->actingAs($admin)
            ->putJson("/api/group-roles/{$adminGroup->id}", ['name' => 'Admins', 'role' => 'super', 'employee_ids' => []])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'last_super_admin');

        $this->assertSame('Administrators', $adminGroup->fresh()->name);
        $this->assertTrue($this->isMember($adminGroup, $adminEmployee));
        $this->assertFalse($this->isMember($ordinary, $adminEmployee));
        $this->assertTrue($admin->fresh()->isSuper());
        $this->assertSame((string) $ordinary->id, (string) AppSetting::get('default_employee_group_id'));
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_last_super_admin_cannot_be_removed_by_deleting_the_administrator_group(): void
    {
        $adminGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada', $adminGroup);
        AppSetting::put('default_employee_group_id', (string) $adminGroup->id);
        $auditBefore = AuditLog::count();

        $this->actingAs($admin)
            ->deleteJson("/api/group-roles/{$adminGroup->id}")
            ->assertUnprocessable()
            ->assertJsonPath('code', 'last_super_admin');

        $this->assertDatabaseHas('group_roles', ['id' => $adminGroup->id]);
        $this->assertTrue($this->isMember($adminGroup, $adminEmployee));
        $this->assertTrue($admin->fresh()->isSuper());
        $this->assertSame((string) $adminGroup->id, (string) AppSetting::get('default_employee_group_id'));
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_an_unlinked_super_admin_counts_so_the_removal_goes_through(): void
    {
        $adminGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada', $adminGroup);
        $unlinkedSuper = User::factory()->create(['role' => 'super']);
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        AppSetting::put('default_employee_group_id', (string) $ordinary->id);

        $this->actingAs($admin)
            ->putJson("/api/group-roles/{$adminGroup->id}", ['name' => 'Administrators', 'role' => 'super', 'employee_ids' => []])
            ->assertOk();

        $this->assertTrue($this->isMember($ordinary, $adminEmployee));
        $this->assertSame('staff', $admin->fresh()->role->key);
        $this->assertTrue($unlinkedSuper->fresh()->isSuper());
    }

    public function test_super_caller_can_rename_the_administrator_group_and_add_a_member(): void
    {
        $adminGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada', $adminGroup);
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $newcomer = $this->staffEmployee('Ben', $ordinary);
        $auditBefore = AuditLog::count();

        $this->actingAs($admin)
            ->putJson("/api/group-roles/{$adminGroup->id}", ['name' => 'Admins', 'role' => 'super', 'employee_ids' => [$adminEmployee->id, $newcomer->id]])
            ->assertOk();

        $this->assertSame('Admins', $adminGroup->fresh()->name);
        $this->assertTrue($this->isMember($adminGroup, $newcomer));
        $this->assertTrue(User::where('employee_id', $newcomer->id)->first()->isSuper());
        $this->assertTrue($admin->fresh()->isSuper());
        $this->assertSame($auditBefore + 1, AuditLog::count());
    }

    public function test_group_writes_still_work_when_no_super_admin_exists(): void
    {
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $staff = $this->staffEmployee('Sam', $ordinary);

        $this->actingAs($this->userWith('system.manage_groups'))
            ->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary Team', 'role' => 'staff', 'employee_ids' => [$staff->id]])
            ->assertOk();

        $this->assertSame('Ordinary Team', $ordinary->fresh()->name);
    }

    public function test_last_super_admin_cannot_be_moved_into_a_new_staff_group(): void
    {
        $adminGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada', $adminGroup);
        $auditBefore = AuditLog::count();

        $this->actingAs($admin)
            ->postJson('/api/group-roles', ['name' => 'Staff', 'role' => 'staff', 'employee_ids' => [$adminEmployee->id]])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'last_super_admin');

        $this->assertDatabaseMissing('group_roles', ['name' => 'Staff']);
        $this->assertTrue($this->isMember($adminGroup, $adminEmployee));
        $this->assertTrue($admin->fresh()->isSuper());
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_non_super_cannot_move_a_super_group_member_who_has_no_login_account(): void
    {
        $adminGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        $accountless = Employee::create(['first_name' => 'Nola', 'last_name' => 'Admin', 'email' => 'nola@inaba.co.th']);
        $adminGroup->employees()->attach($accountless->id);
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $this->actingAs($this->userWith('system.manage_groups'));
        $auditBefore = AuditLog::count();

        $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => 'staff', 'employee_ids' => [$accountless->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'admin_members_protected');

        $this->assertTrue($this->isMember($adminGroup, $accountless));
        $this->assertSame($auditBefore, AuditLog::count());
    }
}
