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
use Illuminate\Support\Facades\Storage;
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

    private function roleWith(string $key, string ...$permissions): Role
    {
        $role = Role::create(['key' => $key, 'name' => ucfirst($key), 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return $role;
    }

    /** @return array<int, string> */
    private function allowedKeys(string $roleKey): array
    {
        return RolePermission::where('role_id', Role::where('key', $roleKey)->value('id'))
            ->where('allowed', true)
            ->orderBy('permission')
            ->pluck('permission')
            ->all();
    }

    /**
     * A non-super manage_groups caller whose login belongs to a fresh employee.
     *
     * @return array{0: User, 1: Employee}
     */
    private function groupManager(): array
    {
        $own = Employee::create(['first_name' => 'Mia', 'last_name' => 'Manager', 'email' => 'mia@inaba.co.th']);
        $caller = $this->userWith('system.manage_groups');
        $caller->update(['employee_id' => $own->id]);

        return [$caller, $own];
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

    public function test_non_super_cannot_delete_a_super_admins_employee(): void
    {
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada');
        $this->actingAs($this->userWith('employees.delete'));
        $auditBefore = AuditLog::count();

        $this->deleteJson("/api/employees/{$adminEmployee->id}")
            ->assertForbidden()
            ->assertJsonPath('message', 'super_account');

        $this->assertDatabaseHas('employees', ['id' => $adminEmployee->id]);
        $this->assertDatabaseHas('users', ['id' => $admin->id]);
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_the_only_super_admin_deleting_their_own_employee_is_refused_before_the_last_admin_check(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('employees/ada.png', 'bytes');
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada');
        $adminEmployee->update(['photo_path' => 'employees/ada.png']);
        $auditBefore = AuditLog::count();

        $this->actingAs($admin)
            ->deleteJson("/api/employees/{$adminEmployee->id}")
            ->assertForbidden()
            ->assertJsonPath('code', 'own_account_delete');

        $this->assertDatabaseHas('employees', ['id' => $adminEmployee->id]);
        $this->assertTrue($admin->fresh()->isSuper());
        Storage::disk('local')->assertExists('employees/ada.png');
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_a_super_admins_employee_can_be_deleted_while_another_super_admin_remains(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('employees/ada.png', 'bytes');
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada');
        $adminEmployee->update(['photo_path' => 'employees/ada.png']);
        $otherSuper = User::factory()->create(['role' => 'super']);

        $this->actingAs($otherSuper)
            ->deleteJson("/api/employees/{$adminEmployee->id}")
            ->assertOk();

        $this->assertDatabaseMissing('employees', ['id' => $adminEmployee->id]);
        $this->assertDatabaseMissing('users', ['id' => $admin->id]);
        Storage::disk('local')->assertMissing('employees/ada.png');
    }

    public function test_nobody_can_delete_their_own_employee(): void
    {
        [$adminEmployee, $admin] = $this->superAdminEmployee('Ada');
        User::factory()->create(['role' => 'super']);
        $usernameEmployee = Employee::create(['first_name' => 'Uma', 'last_name' => 'User', 'email' => 'uma@inaba.co.th', 'username' => 'uma']);
        $usernameCaller = $this->userWith('employees.delete');
        $usernameCaller->update(['username' => 'uma']);
        $idEmployee = Employee::create(['first_name' => 'Ida', 'last_name' => 'Id', 'email' => 'ida@inaba.co.th']);
        $idCaller = $this->userWith();
        $idCaller->update(['employee_id' => $idEmployee->id]);
        $auditBefore = AuditLog::count();

        foreach ([[$admin, $adminEmployee], [$usernameCaller, $usernameEmployee], [$idCaller, $idEmployee]] as [$caller, $own]) {
            $this->actingAs($caller)
                ->deleteJson("/api/employees/{$own->id}")
                ->assertForbidden()
                ->assertJsonPath('message', 'own_account')
                ->assertJsonPath('code', 'own_account_delete');

            $this->assertDatabaseHas('employees', ['id' => $own->id]);
            $this->assertDatabaseHas('users', ['id' => $caller->id]);
        }

        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_role_manager_cannot_edit_their_own_role(): void
    {
        $this->actingAs($this->userWith('system.manage_roles'));
        $auditBefore = AuditLog::count();

        // own_access wins over grant_ceiling
        foreach ([['system.manage_roles'], ['system.manage_roles', 'system.manage_groups'], []] as $permissions) {
            $this->putJson('/api/permissions/staff', ['permissions' => $permissions])
                ->assertForbidden()
                ->assertJsonPath('code', 'own_access');
        }

        $this->assertSame(['system.manage_roles'], $this->allowedKeys('staff'));
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_role_manager_cannot_grant_a_key_they_do_not_hold(): void
    {
        $this->roleWith('clerk', 'system.view_audit');
        $this->actingAs($this->userWith('system.manage_roles'));
        $auditBefore = AuditLog::count();

        $this->putJson('/api/permissions/clerk', ['permissions' => ['system.view_audit', 'system.manage_groups']])
            ->assertForbidden()
            ->assertJsonPath('code', 'grant_ceiling');

        $this->assertSame(['system.view_audit'], $this->allowedKeys('clerk'));
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_role_manager_can_keep_or_remove_keys_they_do_not_hold(): void
    {
        $this->roleWith('clerk', 'system.view_audit', 'system.manage_groups');
        $this->actingAs($this->userWith('system.manage_roles'));

        $this->putJson('/api/permissions/clerk', ['permissions' => ['system.view_audit', 'system.manage_roles']])->assertOk();
        $this->assertSame(['system.manage_roles', 'system.view_audit'], $this->allowedKeys('clerk'));

        $this->putJson('/api/permissions/clerk', ['permissions' => []])->assertOk();
        $this->assertSame([], $this->allowedKeys('clerk'));
    }

    public function test_super_caller_can_grant_any_key_to_any_role(): void
    {
        $this->roleWith('clerk');
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->putJson('/api/permissions/clerk', ['permissions' => ['system.manage_groups', 'system.manage_roles', 'system.view_audit']])
            ->assertOk();

        $this->assertSame(['system.manage_groups', 'system.manage_roles', 'system.view_audit'], $this->allowedKeys('clerk'));
    }

    public function test_creating_a_role_grants_no_permissions(): void
    {
        $this->actingAs($this->userWith('system.manage_roles'));

        $key = $this->postJson('/api/roles', ['name' => 'Fresh'])->assertCreated()->json('data.key');

        $this->assertSame([], $this->allowedKeys($key));
    }

    public function test_group_manager_cannot_add_or_remove_their_own_employee(): void
    {
        [$caller, $own] = $this->groupManager();
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $sam = $this->staffEmployee('Sam', $ordinary);
        $mine = GroupRole::create(['name' => 'Mine', 'role' => 'staff']);
        $mine->employees()->attach($own->id);
        $this->actingAs($caller);
        $auditBefore = AuditLog::count();

        $this->postJson('/api/group-roles', ['name' => 'Fresh', 'role' => 'staff', 'employee_ids' => [$own->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'own_access');
        $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => 'staff', 'employee_ids' => [$sam->id, $own->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'own_access');
        $this->putJson("/api/group-roles/{$mine->id}", ['name' => 'Mine', 'role' => 'staff', 'employee_ids' => []])
            ->assertForbidden()
            ->assertJsonPath('code', 'own_access');

        $this->assertDatabaseMissing('group_roles', ['name' => 'Fresh']);
        $this->assertTrue($this->isMember($mine, $own));
        $this->assertFalse($this->isMember($ordinary, $own));
        $this->assertSame('staff', $caller->fresh()->role->key);
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_group_manager_cannot_change_the_role_of_their_own_group(): void
    {
        $this->roleWith('clerk');
        [$caller, $own] = $this->groupManager();
        $mine = GroupRole::create(['name' => 'Mine', 'role' => 'staff']);
        $mine->employees()->attach($own->id);
        $this->actingAs($caller);
        $auditBefore = AuditLog::count();

        foreach (['clerk', null] as $role) {
            $this->putJson("/api/group-roles/{$mine->id}", ['name' => 'Mine', 'role' => $role, 'employee_ids' => [$own->id]])
                ->assertForbidden()
                ->assertJsonPath('code', 'own_access');
        }

        $this->assertSame('staff', $mine->fresh()->role->key);
        $this->assertSame('staff', $caller->fresh()->role->key);
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_group_manager_cannot_delete_their_own_group(): void
    {
        $this->roleWith('boss', 'system.manage_groups', 'system.view_audit');
        [$caller, $own] = $this->groupManager();
        $mine = GroupRole::create(['name' => 'Mine', 'role' => 'staff']);
        $mine->employees()->attach($own->id);
        AppSetting::put('default_employee_group_id', (string) GroupRole::create(['name' => 'Bosses', 'role' => 'boss'])->id);
        $auditBefore = AuditLog::count();

        $this->actingAs($caller)
            ->deleteJson("/api/group-roles/{$mine->id}")
            ->assertForbidden()
            ->assertJsonPath('code', 'own_access');

        $this->assertTrue($this->isMember($mine, $own));
        $this->assertSame('staff', $caller->fresh()->role->key);
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_group_manager_cannot_make_a_higher_role_group_the_default(): void
    {
        $this->roleWith('boss', 'system.manage_groups', 'system.view_audit');
        $this->roleWith('clerk', 'system.manage_groups');
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $bosses = GroupRole::create(['name' => 'Bosses', 'role' => 'boss']);
        $clerks = GroupRole::create(['name' => 'Clerks', 'role' => 'clerk']);
        AppSetting::put('default_employee_group_id', (string) $ordinary->id);
        [$caller] = $this->groupManager();
        $this->actingAs($caller);
        $auditBefore = AuditLog::count();

        $this->putJson('/api/group-roles-default', ['group_id' => $bosses->id])
            ->assertForbidden()
            ->assertJsonPath('code', 'grant_ceiling');

        $this->assertSame((string) $ordinary->id, (string) AppSetting::get('default_employee_group_id'));
        $this->assertSame($auditBefore, AuditLog::count());

        $this->putJson('/api/group-roles-default', ['group_id' => $clerks->id])->assertOk();
        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->putJson('/api/group-roles-default', ['group_id' => $bosses->id])
            ->assertOk();
    }

    public function test_group_manager_can_clear_the_default_group(): void
    {
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        AppSetting::put('default_employee_group_id', (string) $ordinary->id);
        [$caller] = $this->groupManager();

        $this->actingAs($caller)
            ->putJson('/api/group-roles-default', ['group_id' => null])
            ->assertOk()
            ->assertJsonPath('default_group_id', null);

        $this->assertNull(AppSetting::get('default_employee_group_id'));
    }

    public function test_raising_an_empty_default_groups_role_is_ceiling_checked(): void
    {
        $this->roleWith('boss', 'system.manage_groups', 'system.manage_roles', 'system.view_audit');
        [$caller] = $this->groupManager();
        $team = GroupRole::create(['name' => 'Team', 'role' => 'staff']);
        $sam = $this->staffEmployee('Sam', $team);
        $tom = $this->staffEmployee('Tom', $team);
        $everyone = GroupRole::create(['name' => 'Everyone', 'role' => 'staff']);
        AppSetting::put('default_employee_group_id', (string) $everyone->id);
        $this->actingAs($caller);
        $auditBefore = AuditLog::count();

        $this->putJson("/api/group-roles/{$everyone->id}", ['name' => 'Everyone', 'role' => 'boss', 'employee_ids' => []])
            ->assertForbidden()
            ->assertJsonPath('code', 'grant_ceiling');

        $this->assertSame('staff', $everyone->fresh()->role->key);
        $this->assertSame($auditBefore, AuditLog::count());

        $this->putJson("/api/group-roles/{$team->id}", ['name' => 'Team', 'role' => 'staff', 'employee_ids' => [$tom->id]])
            ->assertOk();

        $this->assertTrue($this->isMember($everyone, $sam));
        $this->assertSame('staff', User::where('employee_id', $sam->id)->first()->role->key);
    }

    public function test_a_default_groups_role_can_change_within_the_ceiling(): void
    {
        $this->roleWith('clerk', 'system.manage_groups');
        [$caller] = $this->groupManager();
        $everyone = GroupRole::create(['name' => 'Everyone', 'role' => 'staff']);
        AppSetting::put('default_employee_group_id', (string) $everyone->id);

        $this->actingAs($caller)
            ->putJson("/api/group-roles/{$everyone->id}", ['name' => 'Everyone', 'role' => 'clerk', 'employee_ids' => []])
            ->assertOk();

        $this->assertSame('clerk', $everyone->fresh()->role->key);
    }

    public function test_a_stale_permission_key_does_not_block_handing_out_a_role(): void
    {
        $legacy = $this->roleWith('legacy', 'system.manage_groups', 'retired.old_key');
        [$caller] = $this->groupManager();
        $loose = GroupRole::create(['name' => 'Loose', 'role' => 'staff']);
        $sam = $this->staffEmployee('Sam', $loose);

        $this->assertSame(['system.manage_groups'], $legacy->allowedKeys());

        $this->actingAs($caller)
            ->postJson('/api/group-roles', ['name' => 'Legacy', 'role' => 'legacy', 'employee_ids' => [$sam->id]])
            ->assertCreated();

        $this->assertSame('legacy', User::where('employee_id', $sam->id)->first()->role->key);
    }

    public function test_group_manager_can_rename_their_own_group(): void
    {
        [$caller, $own] = $this->groupManager();
        $mine = GroupRole::create(['name' => 'Mine', 'role' => 'staff']);
        $mine->employees()->attach($own->id);

        $this->actingAs($caller)
            ->putJson("/api/group-roles/{$mine->id}", ['name' => 'My Team', 'role' => 'staff', 'employee_ids' => [$own->id]])
            ->assertOk();

        $this->assertSame('My Team', $mine->fresh()->name);
        $this->assertTrue($this->isMember($mine, $own));
    }

    public function test_a_caller_linked_only_by_username_is_still_caught_by_own_access(): void
    {
        $own = Employee::create(['first_name' => 'Meg', 'last_name' => 'Manager', 'email' => 'meg@inaba.co.th', 'username' => 'meg']);
        $caller = $this->userWith('system.manage_groups');
        $caller->update(['username' => 'meg']);
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $this->actingAs($caller);
        $auditBefore = AuditLog::count();

        $this->postJson('/api/group-roles', ['name' => 'Fresh', 'role' => 'staff', 'employee_ids' => [$own->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'own_access');
        $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => 'staff', 'employee_ids' => [$own->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'own_access');

        $this->assertDatabaseMissing('group_roles', ['name' => 'Fresh']);
        $this->assertFalse($this->isMember($ordinary, $own));
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_group_manager_cannot_hand_out_a_role_above_their_own(): void
    {
        $this->roleWith('boss', 'system.manage_groups', 'system.view_audit');
        [$caller] = $this->groupManager();
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $sam = $this->staffEmployee('Sam', $ordinary);
        $bosses = GroupRole::create(['name' => 'Bosses', 'role' => 'boss']);
        $bea = $this->staffEmployee('Bea', $bosses);
        $loose = GroupRole::create(['name' => 'Loose', 'role' => 'staff']);
        $ben = $this->staffEmployee('Ben', $loose);
        $this->actingAs($caller);
        $auditBefore = AuditLog::count();

        $this->postJson('/api/group-roles', ['name' => 'New Bosses', 'role' => 'boss', 'employee_ids' => [$sam->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'grant_ceiling');
        $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => 'boss', 'employee_ids' => [$sam->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'grant_ceiling');
        $this->putJson("/api/group-roles/{$bosses->id}", ['name' => 'Bosses', 'role' => 'boss', 'employee_ids' => [$bea->id, $ben->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'grant_ceiling');

        $this->assertDatabaseMissing('group_roles', ['name' => 'New Bosses']);
        $this->assertSame('staff', $ordinary->fresh()->role->key);
        $this->assertTrue($this->isMember($ordinary, $sam));
        $this->assertSame('staff', User::where('employee_id', $sam->id)->first()->role->key);
        $this->assertTrue($this->isMember($loose, $ben));
        $this->assertFalse($this->isMember($bosses, $ben));
        $this->assertSame('staff', User::where('employee_id', $ben->id)->first()->role->key);
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_group_manager_can_rename_a_higher_role_group_or_create_it_empty(): void
    {
        $this->roleWith('boss', 'system.manage_groups', 'system.view_audit');
        [$caller] = $this->groupManager();
        $bosses = GroupRole::create(['name' => 'Bosses', 'role' => 'boss']);
        $bea = $this->staffEmployee('Bea', $bosses);
        $this->actingAs($caller);

        $this->putJson("/api/group-roles/{$bosses->id}", ['name' => 'Senior', 'role' => 'boss', 'employee_ids' => [$bea->id]])
            ->assertOk();
        $this->postJson('/api/group-roles', ['name' => 'Spare Bosses', 'role' => 'boss', 'employee_ids' => []])
            ->assertCreated();

        $this->assertSame('Senior', $bosses->fresh()->name);
        $this->assertDatabaseHas('group_roles', ['name' => 'Spare Bosses']);
    }

    public function test_group_manager_can_hand_out_a_role_within_their_own(): void
    {
        $this->roleWith('clerk', 'system.manage_groups');
        $this->roleWith('blank');
        [$caller] = $this->groupManager();
        $loose = GroupRole::create(['name' => 'Loose', 'role' => 'staff']);
        $sam = $this->staffEmployee('Sam', $loose);
        $tom = $this->staffEmployee('Tom', $loose);
        $una = $this->staffEmployee('Una', $loose);
        $this->actingAs($caller);

        $this->postJson('/api/group-roles', ['name' => 'Clerks', 'role' => 'clerk', 'employee_ids' => [$sam->id]])->assertCreated();
        $this->postJson('/api/group-roles', ['name' => 'Blank', 'role' => 'blank', 'employee_ids' => [$tom->id]])->assertCreated();
        $this->postJson('/api/group-roles', ['name' => 'Roleless', 'role' => null, 'employee_ids' => [$una->id]])->assertCreated();

        $this->assertSame('clerk', User::where('employee_id', $sam->id)->first()->role->key);
        $this->assertSame('blank', User::where('employee_id', $tom->id)->first()->role->key);
        $this->assertTrue($this->isMember(GroupRole::where('name', 'Roleless')->first(), $una));
    }

    public function test_refusal_order_for_group_writes(): void
    {
        $this->roleWith('boss', 'system.manage_groups', 'system.view_audit');
        [$caller, $own] = $this->groupManager();
        $adminGroup = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        [$adminEmployee] = $this->superAdminEmployee('Ada', $adminGroup);
        $this->actingAs($caller);
        $auditBefore = AuditLog::count();

        // super group, then own access, then protected members, then grant ceiling
        $this->postJson('/api/group-roles', ['name' => 'Fresh', 'role' => 'super', 'employee_ids' => [$own->id]])
            ->assertForbidden()
            ->assertJsonPath('message', 'Only an Administrator can manage the Administrator role group.');
        $this->postJson('/api/group-roles', ['name' => 'Fresh', 'role' => 'boss', 'employee_ids' => [$own->id, $adminEmployee->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'own_access');
        $this->postJson('/api/group-roles', ['name' => 'Fresh', 'role' => 'boss', 'employee_ids' => [$adminEmployee->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'admin_members_protected');

        $this->assertDatabaseMissing('group_roles', ['name' => 'Fresh']);
        $this->assertSame($auditBefore, AuditLog::count());
    }

    public function test_super_caller_passes_the_ceiling_and_own_access_checks(): void
    {
        $this->roleWith('boss', 'system.manage_groups', 'system.view_audit');
        $own = Employee::create(['first_name' => 'Sue', 'last_name' => 'Super', 'email' => 'sue@inaba.co.th']);
        $caller = User::factory()->create(['role' => 'super', 'employee_id' => $own->id]);
        User::factory()->create(['role' => 'super']);
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $sam = $this->staffEmployee('Sam', $ordinary);
        $this->actingAs($caller);

        $bosses = $this->postJson('/api/group-roles', ['name' => 'Bosses', 'role' => 'boss', 'employee_ids' => [$sam->id]])
            ->assertCreated()
            ->json('data.id');
        $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => 'boss', 'employee_ids' => [$own->id]])
            ->assertOk();

        $this->assertSame('boss', User::where('employee_id', $sam->id)->first()->role->key);
        $this->assertTrue($this->isMember(GroupRole::find($bosses), $sam));
        $this->assertTrue($this->isMember($ordinary, $own));
        $this->assertSame('boss', $ordinary->fresh()->role->key);
    }

    private function memberLabel(Employee $employee): string
    {
        $employee->refresh();

        return "{$employee->name} ({$employee->code})";
    }

    private function accountOf(Employee $employee): User
    {
        return User::where('employee_id', $employee->id)->firstOrFail();
    }

    private function lastAuditFor(string $action): AuditLog
    {
        return AuditLog::where('action', $action)->latest('id')->firstOrFail();
    }

    public function test_group_update_audits_members_and_the_role_changes_they_cause(): void
    {
        $this->roleWith('boss');
        $this->roleWith('basic');
        $basics = GroupRole::create(['name' => 'Basics', 'role' => 'basic']);
        AppSetting::put('default_employee_group_id', (string) $basics->id);
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $sam = $this->staffEmployee('Sam', $ordinary);
        $tom = $this->staffEmployee('Tom', $ordinary);
        $una = $this->staffEmployee('Una', $basics);
        $this->accountOf($una)->update(['role' => 'basic']);
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => 'boss', 'employee_ids' => [$sam->id, $una->id]])
            ->assertOk();

        $details = $this->lastAuditFor('Updated role group')->details;
        $this->assertSame([$this->memberLabel($una)], $details['added']);
        $this->assertSame([$this->memberLabel($tom)], $details['removed']);
        $this->assertEqualsCanonicalizing([
            ['name' => $this->accountOf($sam)->name, 'from' => 'Staff', 'to' => 'Boss'],
            ['name' => $this->accountOf($tom)->name, 'from' => 'Staff', 'to' => 'Basic'],
            ['name' => $this->accountOf($una)->name, 'from' => 'Basic', 'to' => 'Boss'],
        ], $details['role_changes']);
        $this->assertSame(['from' => 'Staff', 'to' => 'Boss'], $details['changes']['role_id']);

        // Unchanged accounts are left out
        $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => 'boss', 'employee_ids' => [$sam->id]])
            ->assertOk();

        $details = $this->lastAuditFor('Updated role group')->details;
        $this->assertArrayNotHasKey('added', $details);
        $this->assertSame([$this->memberLabel($una)], $details['removed']);
        $this->assertSame([['name' => $this->accountOf($una)->name, 'from' => 'Boss', 'to' => 'Basic']], $details['role_changes']);
        $this->assertArrayNotHasKey('changes', $details);
    }

    public function test_a_rename_alone_audits_no_member_details(): void
    {
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $sam = $this->staffEmployee('Sam', $ordinary);
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary Team', 'role' => 'staff', 'employee_ids' => [$sam->id]])
            ->assertOk();

        $this->assertSame(
            ['changes' => ['name' => ['from' => 'Ordinary', 'to' => 'Ordinary Team']]],
            $this->lastAuditFor('Updated role group')->details,
        );
    }

    public function test_group_store_audits_the_initial_members_and_their_role_changes(): void
    {
        $this->roleWith('boss');
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $sam = $this->staffEmployee('Sam', $ordinary);
        $kim = Employee::create(['first_name' => 'Kim', 'last_name' => 'Nologin', 'email' => 'kim@inaba.co.th']);
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->postJson('/api/group-roles', ['name' => 'Bosses', 'role' => 'boss', 'employee_ids' => [$sam->id, $kim->id]])
            ->assertCreated();

        $details = $this->lastAuditFor('Created role group')->details;
        $this->assertEqualsCanonicalizing([$this->memberLabel($sam), $this->memberLabel($kim)], $details['added']);
        $this->assertArrayNotHasKey('removed', $details);
        $this->assertSame([['name' => $this->accountOf($sam)->name, 'from' => 'Staff', 'to' => 'Boss']], $details['role_changes']);
    }

    public function test_group_destroy_audits_the_members_and_their_fallback_role_changes(): void
    {
        $this->roleWith('boss');
        $this->roleWith('basic');
        $basics = GroupRole::create(['name' => 'Basics', 'role' => 'basic']);
        AppSetting::put('default_employee_group_id', (string) $basics->id);
        $bosses = GroupRole::create(['name' => 'Bosses', 'role' => 'boss']);
        $sam = $this->staffEmployee('Sam', $bosses);
        $this->accountOf($sam)->update(['role' => 'boss']);
        $kim = Employee::create(['first_name' => 'Kim', 'last_name' => 'Nologin', 'email' => 'kim@inaba.co.th']);
        $bosses->employees()->attach($kim->id);
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->deleteJson("/api/group-roles/{$bosses->id}")->assertOk();

        $details = $this->lastAuditFor('Deleted role group')->details;
        $this->assertEqualsCanonicalizing([$this->memberLabel($sam), $this->memberLabel($kim)], $details['removed']);
        $this->assertSame([['name' => $this->accountOf($sam)->name, 'from' => 'Boss', 'to' => 'Basic']], $details['role_changes']);
        $this->assertSame('Bosses', $details['snapshot']['name']);
        $this->assertTrue($this->isMember($basics, $sam));
    }

    public function test_permission_save_still_writes_its_audit_row(): void
    {
        $this->roleWith('clerk', 'system.view_audit');
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->putJson('/api/permissions/clerk', ['permissions' => ['system.manage_groups']])->assertOk();

        $audit = $this->lastAuditFor('Updated permissions');
        $this->assertSame('Clerk', $audit->target);
        $this->assertSame(['added' => ['system.manage_groups'], 'removed' => ['system.view_audit']], $audit->details);
    }

    public function test_role_change_of_an_account_linked_only_by_username_is_audited(): void
    {
        $this->roleWith('boss');
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $sam = Employee::create(['first_name' => 'Sam', 'last_name' => 'Staff', 'email' => 'sam@inaba.co.th', 'username' => 'sam']);
        $samAccount = User::factory()->create(['role' => 'staff', 'username' => 'sam']);
        $ordinary->employees()->attach($sam->id);
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => 'boss', 'employee_ids' => [$sam->id]])
            ->assertOk();

        $this->assertNull($samAccount->fresh()->employee_id);
        $this->assertSame(
            [['name' => $samAccount->name, 'from' => 'Staff', 'to' => 'Boss']],
            $this->lastAuditFor('Updated role group')->details['role_changes'],
        );
    }

    public function test_removing_a_member_with_no_default_group_audits_the_move_to_user(): void
    {
        $this->roleWith('user');
        $ordinary = GroupRole::create(['name' => 'Ordinary', 'role' => 'staff']);
        $sam = $this->staffEmployee('Sam', $ordinary);
        $tom = $this->staffEmployee('Tom', $ordinary);
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->putJson("/api/group-roles/{$ordinary->id}", ['name' => 'Ordinary', 'role' => 'staff', 'employee_ids' => [$sam->id]])
            ->assertOk();

        $this->assertNull(GroupRole::defaultForNewEmployees());
        $details = $this->lastAuditFor('Updated role group')->details;
        $this->assertSame([$this->memberLabel($tom)], $details['removed']);
        $this->assertSame([['name' => $this->accountOf($tom)->name, 'from' => 'Staff', 'to' => 'User']], $details['role_changes']);
    }
}
