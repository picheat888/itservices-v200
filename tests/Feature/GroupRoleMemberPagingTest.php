<?php

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The Role Group dialog loads members and candidates a page at a time and saves only who joined or left,
 * so the list endpoint no longer ships every member id.
 */
class GroupRoleMemberPagingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['key' => 'super', 'name' => 'Administrator', 'is_system' => true]);
        Role::create(['key' => 'user', 'name' => 'Staff', 'is_system' => false]);
        Role::create(['key' => 'admin', 'name' => 'IT Support', 'is_system' => false]);
    }

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function employee(string $first, ?int $departmentId = null): Employee
    {
        return Employee::create(['first_name' => $first, 'last_name' => 'Test', 'department_id' => $departmentId]);
    }

    /** A non-super caller holding the given permission keys. */
    private function userWith(string ...$permissions): User
    {
        $role = Role::create(['key' => 'clerk', 'name' => 'Clerk', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => 'clerk']);
    }

    public function test_the_list_sends_member_counts_without_member_ids(): void
    {
        $group = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $group->employees()->attach([$this->employee('Ann')->id, $this->employee('Ben')->id]);

        $this->actingAs($this->super())
            ->getJson('/api/group-roles')
            ->assertOk()
            ->assertJsonPath('data.0.member_count', 2)
            ->assertJsonPath('data.0.role_label', 'IT Support')
            ->assertJsonMissingPath('data.0.employee_ids')
            ->assertJsonMissingPath('data.0.employees');
    }

    public function test_the_list_marks_the_group_holding_the_callers_own_employee(): void
    {
        $mine = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $other = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        $me = $this->employee('Me');
        $mine->employees()->attach($me->id);
        $caller = User::factory()->create(['role' => 'super', 'employee_id' => $me->id]);

        $groups = collect($this->actingAs($caller)->getJson('/api/group-roles')->assertOk()->json('data'))->keyBy('id');

        $this->assertTrue($groups[$mine->id]['includes_me']);
        $this->assertFalse($groups[$other->id]['includes_me']);
    }

    public function test_members_come_a_page_at_a_time_and_can_be_searched(): void
    {
        $group = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        foreach (range(1, 12) as $n) {
            $group->employees()->attach($this->employee("Person{$n}")->id);
        }
        $group->employees()->attach($this->employee('Zelda')->id);

        $this->actingAs($this->super())
            ->getJson("/api/group-roles/{$group->id}/members?per_page=10")
            ->assertOk()
            ->assertJsonCount(10, 'data')
            ->assertJsonPath('meta.total', 13)
            ->assertJsonPath('meta.last_page', 2);

        $this->getJson("/api/group-roles/{$group->id}/members?search=zel")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Zelda Test');
    }

    public function test_candidates_leave_out_the_group_and_say_where_people_sit_now(): void
    {
        $itTeam = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $allStaff = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        $member = $this->employee('Inside');
        $elsewhere = $this->employee('Elsewhere');
        $itTeam->employees()->attach($member->id);
        $allStaff->employees()->attach($elsewhere->id);

        $response = $this->actingAs($this->super())
            ->getJson("/api/group-roles-candidates?group_id={$itTeam->id}")
            ->assertOk()
            ->assertJsonPath('meta.total', 1);

        $this->assertSame($elsewhere->id, $response->json('data.0.id'));
        $this->assertSame('All Staff', $response->json('data.0.group'));
        $this->assertFalse($response->json('data.0.protected'));
    }

    public function test_a_whole_department_is_offered_only_with_a_department(): void
    {
        $it = Department::create(['name' => 'IT', 'tag' => 'IT']);
        $hr = Department::create(['name' => 'HR', 'tag' => 'HR']);
        foreach (range(1, 3) as $n) {
            $this->employee("It{$n}", $it->id);
        }
        $this->employee('Hr1', $hr->id);

        $this->actingAs($this->super())
            ->getJson("/api/group-roles-candidates?department_id={$it->id}&all=1")
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('meta.total', 3)
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('meta.last_page', 1);

        // Without a department "all" falls back to one page
        $this->getJson('/api/group-roles-candidates?all=1')
            ->assertOk()
            ->assertJsonPath('meta.total', 4);
    }

    public function test_saving_with_add_and_remove_ids_moves_only_those_people(): void
    {
        $default = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        AppSetting::put('default_employee_group_id', (string) $default->id);
        $itTeam = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $stays = $this->employee('Stays');
        $leaves = $this->employee('Leaves');
        $joins = $this->employee('Joins');
        $itTeam->employees()->attach([$stays->id, $leaves->id]);
        $default->employees()->attach($joins->id);

        $this->actingAs($this->super())
            ->putJson("/api/group-roles/{$itTeam->id}", ['name' => 'IT Team', 'role' => 'admin', 'add_ids' => [$joins->id], 'remove_ids' => [$leaves->id]])
            ->assertOk()
            ->assertJsonPath('data.member_count', 2);

        $this->assertEqualsCanonicalizing([$stays->id, $joins->id], $itTeam->employees()->pluck('employees.id')->all());
        $this->assertDatabaseHas('group_role_employee', ['group_role_id' => $default->id, 'employee_id' => $leaves->id]);
        $this->assertDatabaseMissing('group_role_employee', ['group_role_id' => $default->id, 'employee_id' => $joins->id]);
    }

    public function test_a_name_only_save_keeps_every_member(): void
    {
        $itTeam = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $itTeam->employees()->attach($this->employee('Ann')->id);

        $this->actingAs($this->super())
            ->putJson("/api/group-roles/{$itTeam->id}", ['name' => 'IT Crew', 'role' => 'admin', 'add_ids' => [], 'remove_ids' => []])
            ->assertOk();

        $this->assertSame(1, $itTeam->employees()->count());
        $this->assertSame('IT Crew', $itTeam->fresh()->name);
    }

    public function test_member_lists_need_the_manage_groups_permission(): void
    {
        $group = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);

        $this->actingAs(User::factory()->create(['role' => 'user']))
            ->getJson("/api/group-roles/{$group->id}/members")
            ->assertForbidden();
        $this->getJson('/api/group-roles-candidates')->assertForbidden();
    }

    public function test_the_lists_need_manage_groups_even_with_the_permission_module(): void
    {
        $group = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);

        $this->actingAs($this->userWith('system.manage_permissions'))
            ->getJson("/api/group-roles/{$group->id}/members")
            ->assertForbidden();
        $this->getJson('/api/group-roles-candidates')->assertForbidden();
    }

    public function test_super_admins_are_flagged_protected_for_a_non_super_caller_only(): void
    {
        $group = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $ada = $this->employee('Ada');
        User::factory()->create(['role' => 'super', 'employee_id' => $ada->id]);
        $sam = $this->employee('Sam');
        $group->employees()->attach([$ada->id, $sam->id]);
        $outsider = $this->employee('Abe');
        User::factory()->create(['role' => 'super', 'employee_id' => $outsider->id]);

        $flags = fn (string $url) => collect($this->getJson($url)->assertOk()->json('data'))->pluck('protected', 'id')->all();

        $this->actingAs($this->userWith('system.manage_groups'));
        $this->assertSame([$ada->id => true, $sam->id => false], $flags("/api/group-roles/{$group->id}/members"));
        $this->assertSame([$outsider->id => true], $flags("/api/group-roles-candidates?group_id={$group->id}"));

        $this->actingAs($this->super());
        $this->assertSame([$ada->id => false, $sam->id => false], $flags("/api/group-roles/{$group->id}/members"));
        $this->assertSame([$outsider->id => false], $flags("/api/group-roles-candidates?group_id={$group->id}"));
    }

    public function test_candidates_leave_out_inactive_employees(): void
    {
        $active = $this->employee('Active');
        Employee::create(['first_name' => 'Gone', 'last_name' => 'Test', 'status' => 'resigned']);

        $response = $this->actingAs($this->super())
            ->getJson('/api/group-roles-candidates')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);

        $this->assertSame($active->id, $response->json('data.0.id'));
    }

    public function test_array_params_are_refused(): void
    {
        $group = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $this->actingAs($this->super());

        foreach (['search[]=a', 'per_page[]=10'] as $query) {
            $this->getJson("/api/group-roles/{$group->id}/members?{$query}")->assertUnprocessable();
            $this->getJson("/api/group-roles-candidates?{$query}")->assertUnprocessable();
        }
        foreach (['group_id[]=1', 'department_id[]=1', 'all[]=1'] as $query) {
            $this->getJson("/api/group-roles-candidates?{$query}")->assertUnprocessable();
        }
    }

    public function test_a_whole_department_is_sent_with_no_cap(): void
    {
        $it = Department::create(['name' => 'IT', 'tag' => 'IT']);
        foreach (array_chunk(range(1, 520), 100) as $numbers) {
            Employee::insert(array_map(fn (int $n) => [
                'code' => sprintf('EMP-T%04d', $n), 'first_name' => "Person{$n}", 'last_name' => 'Test', 'department_id' => $it->id, 'status' => 'active',
                'created_at' => now(), 'updated_at' => now(),
            ], $numbers));
        }

        $this->actingAs($this->super())
            ->getJson("/api/group-roles-candidates?department_id={$it->id}&all=1")
            ->assertOk()
            ->assertJsonCount(520, 'data')
            ->assertJsonPath('meta.total', 520)
            ->assertJsonPath('meta.last_page', 1);
    }

    public function test_the_callers_own_row_is_marked_is_me(): void
    {
        $group = GroupRole::create(['name' => 'IT Team', 'role' => 'admin']);
        $byId = $this->employee('Ann');
        $byUsername = Employee::create(['first_name' => 'Ann', 'last_name' => 'Alias', 'username' => 'ann']);
        $other = $this->employee('Ben');
        $group->employees()->attach([$byId->id, $other->id]);
        $caller = User::factory()->create(['role' => 'super', 'employee_id' => $byId->id, 'username' => 'ann']);

        $this->actingAs($caller);
        $members = collect($this->getJson("/api/group-roles/{$group->id}/members")->assertOk()->json('data'))->pluck('is_me', 'id')->all();
        $candidates = collect($this->getJson("/api/group-roles-candidates?group_id={$group->id}")->assertOk()->json('data'))->pluck('is_me', 'id')->all();

        $this->assertSame([$byId->id => true, $other->id => false], $members);
        $this->assertSame([$byUsername->id => true], $candidates);
    }
}
