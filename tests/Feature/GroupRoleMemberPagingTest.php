<?php

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
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
            ->assertJsonMissingPath('meta');

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
}
