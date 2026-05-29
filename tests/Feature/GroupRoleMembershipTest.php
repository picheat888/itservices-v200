<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Employee;
use App\Models\GroupRole;
use App\Models\Role;
use App\Models\User;
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

    /** A super (Administrator) login account — bypasses the manage-groups gate. */
    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    /** Counts how many groups an employee currently belongs to. */
    private function groupCount(int $employeeId): int
    {
        return DB::table('group_role_employee')->where('employee_id', $employeeId)->count();
    }

    public function test_assigning_an_employee_already_in_a_group_moves_them(): void
    {
        $allStaff = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        $itTeam = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $emp = Employee::create(['name' => 'Joe', 'email' => 'joe@inaba.co.th']);
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
        $user = User::factory()->create(['role' => 'user', 'email' => 'joe@inaba.co.th']);
        $emp = Employee::create(['name' => 'Joe', 'email' => 'joe@inaba.co.th']);
        $allStaff = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        $itTeam = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $allStaff->employees()->attach($emp->id);

        $this->actingAs($this->super())
            ->putJson("/api/group-roles/{$itTeam->id}", ['name' => 'IT Team', 'role' => 'admin', 'employee_ids' => [$emp->id]])
            ->assertOk();

        $this->assertSame('admin', $user->fresh()->role);
    }

    public function test_creating_a_group_also_moves_members_out_of_their_old_group(): void
    {
        $allStaff = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        $emp = Employee::create(['name' => 'Joe', 'email' => 'joe@inaba.co.th']);
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
        $emp = Employee::create(['name' => 'Joe']);
        $a->employees()->attach($emp->id);

        $this->expectException(QueryException::class);
        DB::table('group_role_employee')->insert(['group_role_id' => $b->id, 'employee_id' => $emp->id]);
    }

    public function test_removing_an_employee_falls_back_to_the_default_group(): void
    {
        $default = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        AppSetting::put('default_employee_group_id', (string) $default->id);
        $itTeam = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $user = User::factory()->create(['role' => 'admin', 'email' => 'joe@inaba.co.th']);
        $emp = Employee::create(['name' => 'Joe', 'email' => 'joe@inaba.co.th']);
        $itTeam->employees()->attach($emp->id);

        $this->actingAs($this->super())
            ->putJson("/api/group-roles/{$itTeam->id}", ['name' => 'IT Team', 'role' => 'admin', 'employee_ids' => []])
            ->assertOk();

        $this->assertDatabaseHas('group_role_employee', ['group_role_id' => $default->id, 'employee_id' => $emp->id]);
        $this->assertSame(1, $this->groupCount($emp->id));
        $this->assertSame('user', $user->fresh()->role);
    }

    public function test_removing_from_the_default_group_leaves_the_employee_groupless(): void
    {
        $default = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        AppSetting::put('default_employee_group_id', (string) $default->id);
        $user = User::factory()->create(['role' => 'user', 'email' => 'joe@inaba.co.th']);
        $emp = Employee::create(['name' => 'Joe', 'email' => 'joe@inaba.co.th']);
        $default->employees()->attach($emp->id);

        $this->actingAs($this->super())
            ->putJson("/api/group-roles/{$default->id}", ['name' => 'All Staff', 'role' => 'user', 'employee_ids' => []])
            ->assertOk();

        $this->assertSame(0, $this->groupCount($emp->id));
        $this->assertSame('user', $user->fresh()->role);
    }
}
