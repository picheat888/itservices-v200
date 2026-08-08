<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Services\Employee\EmployeeService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Enforces "one employee belongs to exactly one Role Group": assigning an
 * employee to a group moves them out of any previous group, the linked login
 * role follows the move, and removing an employee falls back to the default
 * group.
 */
class GroupRoleMembershipTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        Role::create(['key' => 'user', 'name' => 'Staff', 'is_system' => false]);
        Role::create(['key' => 'admin', 'name' => 'IT Technician', 'is_system' => false]);
    }

    /** A super (Administrator) login account โ€” bypasses the manage-groups gate. */
    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** Counts how many groups an employee currently belongs to. */
    private function groupCount(int $employeeId): int
    {
        return DB::table('group_role_employee')->where('employee_id', $employeeId)->count();
    }

    public function test_a_new_employee_ends_up_on_the_default_groups_role(): void
    {
        $default = GroupRole::create(['name' => 'All Staff', 'role' => 'admin']);
        AppSetting::put('default_employee_group_id', (string) $default->id);

        $service = app(EmployeeService::class);
        $employee = $service->create(['first_name' => 'New', 'last_name' => 'Hire']);
        $account = $service->createUserWithCredentials($employee, 'newhire', 'Str0ng!pass');

        $this->assertSame($default->role_id, $account->role_id);
        // The Add Employee form states this before any of that happens, so the promise
        // and the outcome have to come out of the same call.
        $this->assertSame($default->role->name, $service->defaultRoleForNewEmployee()->name);
    }

    public function test_no_default_group_means_no_default_role_rather_than_a_guess(): void
    {
        // The seeded Staff role is right there and is deliberately NOT used: an install
        // may define its own templates, so a role key named in code would be a guess
        // about somebody else's configuration.
        $this->assertNotNull(Role::where('key', 'user')->first());
        $this->assertNull(app(EmployeeService::class)->defaultRoleForNewEmployee());
    }

    public function test_settings_names_the_role_a_new_hire_will_actually_get(): void
    {
        $default = GroupRole::create(['name' => 'All Staff', 'role' => 'admin']);
        AppSetting::put('default_employee_group_id', (string) $default->id);
        // The orphan setting the Add Employee card used to read. Nothing has ever applied
        // it, so naming a different role here must not change what the card is told —
        // the two used to agree only while both fell back to Staff.
        AppSetting::put('default_employee_role', 'super');

        $this->actingAs($this->super())->getJson('/api/settings')
            ->assertOk()
            ->assertJsonPath('data.default_employee_role_label', 'IT Technician')
            ->assertJsonMissingPath('data.default_employee_role');
    }

    public function test_settings_reports_no_role_and_creates_none(): void
    {
        $before = Role::count();

        $this->actingAs($this->super())->getJson('/api/settings')
            ->assertOk()
            // Null: a system nobody has finished configuring says so rather than naming
            // the seeded Staff role as if somebody had chosen it.
            ->assertJsonPath('data.default_employee_role_label', null);

        // Reading settings must not write either: this used to firstOrCreate a role
        // keyed `user`, so merely loading a page conjured one up with no permissions.
        $this->assertSame($before, Role::count());
    }

    public function test_creating_a_login_is_refused_when_no_role_group_answers(): void
    {
        $employee = Employee::create(['first_name' => 'No', 'last_name' => 'Group']);
        $rolesBefore = Role::count();

        $this->actingAs($this->super())
            ->postJson("/api/employees/{$employee->id}/credentials", [
                'username' => 'nogroup',
                'password' => 'Str0ng!pass',
                'password_confirmation' => 'Str0ng!pass',
            ])
            ->assertStatus(422)
            // A code the SPA translates, not a sentence.
            ->assertJsonPath('errors.role.0', 'no_role_configured');

        // Refused outright: no account, and above all no invented role to hand it.
        $this->assertSame(0, User::where('username', 'nogroup')->count());
        $this->assertSame($rolesBefore, Role::count());
    }

    public function test_a_login_is_still_created_when_the_employee_has_their_own_group(): void
    {
        // No default group — but this person is in a group of their own, which answers
        // the question without one. Guards against over-tightening the refusal.
        $itTeam = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $employee = Employee::create(['first_name' => 'Has', 'last_name' => 'Group']);
        $itTeam->employees()->attach($employee->id);

        $this->actingAs($this->super())
            ->postJson("/api/employees/{$employee->id}/credentials", [
                'username' => 'hasgroup',
                'password' => 'Str0ng!pass',
                'password_confirmation' => 'Str0ng!pass',
            ])
            ->assertCreated();

        $this->assertSame($itTeam->role_id, User::where('username', 'hasgroup')->value('role_id'));
    }

    public function test_assigning_an_employee_already_in_a_group_moves_them(): void
    {
        $allStaff = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        $itTeam = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $emp = Employee::create(['first_name' => 'Joe', 'last_name' => 'Test', 'email' => 'joe@inaba.co.th']);
        $allStaff->employees()->attach($emp->id);

        $this->actingAs($this->super())
            ->putJson("/api/group-roles/{$itTeam->id}", ['name' => 'IT Team', 'role' => 'admin', 'employee_ids' => [$emp->id]])
            ->assertOk();

        $this->assertDatabaseHas('group_role_employee', ['group_role_id' => $itTeam->id, 'employee_id' => $emp->id]);
        $this->assertDatabaseMissing('group_role_employee', ['group_role_id' => $allStaff->id, 'employee_id' => $emp->id]);
        $this->assertSame(1, $this->groupCount($emp->id));
    }

    public function test_move_updates_the_linked_user_role(): void
    {
        $emp = Employee::create(['first_name' => 'Joe', 'last_name' => 'Test', 'email' => 'joe@inaba.co.th']);
        $user = User::factory()->create(['role' => 'user', 'email' => 'joe@inaba.co.th', 'employee_id' => $emp->id]);
        $allStaff = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        $itTeam = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $allStaff->employees()->attach($emp->id);

        $this->actingAs($this->super())
            ->putJson("/api/group-roles/{$itTeam->id}", ['name' => 'IT Team', 'role' => 'admin', 'employee_ids' => [$emp->id]])
            ->assertOk();

        $this->assertSame('admin', $user->fresh()->role?->key);
    }

    public function test_creating_a_group_also_moves_members_out_of_their_old_group(): void
    {
        $allStaff = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        $emp = Employee::create(['first_name' => 'Joe', 'last_name' => 'Test', 'email' => 'joe@inaba.co.th']);
        $allStaff->employees()->attach($emp->id);

        $this->actingAs($this->super())
            ->postJson('/api/group-roles', ['name' => 'IT Team', 'role' => 'admin', 'employee_ids' => [$emp->id]])
            ->assertCreated();

        $this->assertDatabaseMissing('group_role_employee', ['group_role_id' => $allStaff->id, 'employee_id' => $emp->id]);
        $this->assertSame(1, $this->groupCount($emp->id));
    }

    public function test_unique_index_blocks_a_second_membership(): void
    {
        $a = GroupRole::create(['name' => 'A', 'role' => 'user']);
        $b = GroupRole::create(['name' => 'B', 'role' => 'user']);
        $emp = Employee::create(['first_name' => 'Joe', 'last_name' => 'Test']);
        $a->employees()->attach($emp->id);

        $this->expectException(QueryException::class);
        DB::table('group_role_employee')->insert(['group_role_id' => $b->id, 'employee_id' => $emp->id]);
    }

    public function test_removing_an_employee_falls_back_to_the_default_group(): void
    {
        $default = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        AppSetting::put('default_employee_group_id', (string) $default->id);
        $itTeam = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $emp = Employee::create(['first_name' => 'Joe', 'last_name' => 'Test', 'email' => 'joe@inaba.co.th']);
        $user = User::factory()->create(['role' => 'admin', 'email' => 'joe@inaba.co.th', 'employee_id' => $emp->id]);
        $itTeam->employees()->attach($emp->id);

        $this->actingAs($this->super())
            ->putJson("/api/group-roles/{$itTeam->id}", ['name' => 'IT Team', 'role' => 'admin', 'employee_ids' => []])
            ->assertOk();

        $this->assertDatabaseHas('group_role_employee', ['group_role_id' => $default->id, 'employee_id' => $emp->id]);
        $this->assertSame(1, $this->groupCount($emp->id));
        $this->assertSame('user', $user->fresh()->role?->key);
    }

    /**
     * Mirrors a real provisioned account: the login User is linked to its Employee
     * via the users.employee_id FK, the User email differs from the Employee contact
     * email, and the Employee has no username. Moving INTO a group must still carry
     * the role across โ€” resolved through the FK, not email.
     */
    public function test_move_into_group_follows_role_via_employee_fk(): void
    {
        $emp = Employee::create(['first_name' => 'Kanya', 'last_name' => 'Test', 'email' => 'kanya@inaba.co.th']);
        $user = User::factory()->create(['role' => 'user', 'username' => 'it', 'email' => 'it@inaba.co.th', 'employee_id' => $emp->id]);
        $allStaff = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        $itTeam = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $allStaff->employees()->attach($emp->id);

        $this->actingAs($this->super())
            ->putJson("/api/group-roles/{$itTeam->id}", ['name' => 'IT Team', 'role' => 'admin', 'employee_ids' => [$emp->id]])
            ->assertOk();

        $this->assertSame('admin', $user->fresh()->role?->key);
    }

    /**
     * Same FK-linked account, but the move-OUT / fallback path. Regression guard for
     * the bug where setUserRole() matched on the Employee email first: since the User
     * email differs from the Employee email, the role failed to follow and stayed
     * stuck. It must now fall back to the default group's role via the employee_id FK.
     */
    public function test_move_out_to_default_follows_role_via_employee_fk(): void
    {
        $default = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        AppSetting::put('default_employee_group_id', (string) $default->id);
        $itTeam = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $emp = Employee::create(['first_name' => 'Kanya', 'last_name' => 'Test', 'email' => 'kanya@inaba.co.th']);
        $user = User::factory()->create(['role' => 'admin', 'username' => 'it', 'email' => 'it@inaba.co.th', 'employee_id' => $emp->id]);
        $itTeam->employees()->attach($emp->id);

        $this->actingAs($this->super())
            ->putJson("/api/group-roles/{$itTeam->id}", ['name' => 'IT Team', 'role' => 'admin', 'employee_ids' => []])
            ->assertOk();

        $this->assertSame('user', $user->fresh()->role?->key);
    }

    public function test_removing_from_the_default_group_leaves_the_employee_groupless(): void
    {
        $default = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        AppSetting::put('default_employee_group_id', (string) $default->id);
        $emp = Employee::create(['first_name' => 'Joe', 'last_name' => 'Test', 'email' => 'joe@inaba.co.th']);
        $user = User::factory()->create(['role' => 'user', 'email' => 'joe@inaba.co.th', 'employee_id' => $emp->id]);
        $default->employees()->attach($emp->id);

        $this->actingAs($this->super())
            ->putJson("/api/group-roles/{$default->id}", ['name' => 'All Staff', 'role' => 'user', 'employee_ids' => []])
            ->assertOk();

        $this->assertSame(0, $this->groupCount($emp->id));
        $this->assertSame('user', $user->fresh()->role?->key);
    }
}
