<?php

// Role Groups server fixes: no-role groups give the base role, batched queries, fresh save answers, role options, addable count.

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GroupRoleSyncAndOptionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::create(['key' => 'super', 'name' => 'Administrator', 'color' => '#ef4444', 'is_system' => true]);
        Role::create(['key' => 'user', 'name' => 'Staff', 'is_system' => false]);
        $admin = Role::create(['key' => 'admin', 'name' => 'IT Support', 'color' => '#3b82f6', 'is_system' => false]);
        RolePermission::create(['role_id' => $admin->id, 'permission' => 'tickets.module', 'allowed' => true]);
    }

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
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

    /** An employee with a login account holding the given role, optionally inside a group. */
    private function person(string $first, string $roleKey = 'admin', ?GroupRole $group = null, ?int $departmentId = null): Employee
    {
        $employee = Employee::create(['first_name' => $first, 'last_name' => 'Test', 'department_id' => $departmentId]);
        User::factory()->create(['role' => $roleKey, 'employee_id' => $employee->id]);
        $group?->employees()->attach($employee->id);

        return $employee;
    }

    private function accountRole(Employee $employee): ?string
    {
        return User::where('employee_id', $employee->id)->first()->role?->key;
    }

    private function countQueries(callable $run): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $run();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    public function test_people_in_a_new_group_without_a_role_get_the_base_role(): void
    {
        $it = GroupRole::create(['name' => 'IT', 'role' => 'admin']);
        $sam = $this->person('Sam', 'admin', $it);
        $this->actingAs($this->super());

        $this->postJson('/api/group-roles', ['name' => 'Roleless', 'role' => null, 'employee_ids' => [$sam->id]])->assertCreated();

        $this->assertSame('user', $this->accountRole($sam));
    }

    public function test_clearing_a_groups_role_gives_every_member_the_base_role(): void
    {
        $it = GroupRole::create(['name' => 'IT', 'role' => 'admin']);
        $sam = $this->person('Sam', 'admin', $it);
        $tom = $this->person('Tom', 'admin', $it);
        $this->actingAs($this->super());

        $this->putJson("/api/group-roles/{$it->id}", ['name' => 'IT', 'role' => null])->assertOk();

        $this->assertSame('user', $this->accountRole($sam));
        $this->assertSame('user', $this->accountRole($tom));
    }

    public function test_joining_a_group_without_a_role_gives_the_base_role(): void
    {
        $roleless = GroupRole::create(['name' => 'Roleless', 'role' => null]);
        $it = GroupRole::create(['name' => 'IT', 'role' => 'admin']);
        $sam = $this->person('Sam', 'admin', $it);
        $this->actingAs($this->super());

        $this->putJson("/api/group-roles/{$roleless->id}", ['name' => 'Roleless', 'role' => null, 'add_ids' => [$sam->id], 'remove_ids' => []])->assertOk();

        $this->assertSame('user', $this->accountRole($sam));
        $this->assertSame(0, $it->employees()->count());
    }

    public function test_clearing_the_role_of_the_callers_own_group_is_refused(): void
    {
        $it = GroupRole::create(['name' => 'IT', 'role' => 'admin']);
        $me = Employee::create(['first_name' => 'Mia', 'last_name' => 'Test']);
        $it->employees()->attach($me->id);
        $sam = $this->person('Sam', 'admin', $it);
        $caller = $this->userWith('system.manage_groups');
        $caller->update(['employee_id' => $me->id]);

        $this->actingAs($caller)
            ->putJson("/api/group-roles/{$it->id}", ['name' => 'IT', 'role' => null])
            ->assertForbidden()
            ->assertJsonPath('code', 'own_access');

        $this->assertSame('admin', $it->fresh()->role->key);
        $this->assertSame('admin', $this->accountRole($sam));
    }

    public function test_a_non_super_caller_cannot_move_an_administrator_into_a_group_without_a_role(): void
    {
        $roleless = GroupRole::create(['name' => 'Roleless', 'role' => null]);
        $ada = $this->person('Ada', 'super');
        $this->actingAs($this->userWith('system.manage_groups'));

        $this->putJson("/api/group-roles/{$roleless->id}", ['name' => 'Roleless', 'role' => null, 'add_ids' => [$ada->id], 'remove_ids' => []])
            ->assertForbidden()
            ->assertJsonPath('code', 'admin_members_protected');

        $this->assertSame('super', $this->accountRole($ada));
    }

    public function test_the_group_list_costs_the_same_queries_for_any_number_of_groups(): void
    {
        $this->actingAs($this->super());
        $makeGroups = function (int $count): void {
            foreach (range(1, $count) as $n) {
                GroupRole::create(['name' => 'Group '.uniqid(), 'role' => $n % 2 ? 'admin' : 'user']);
            }
        };

        $makeGroups(2);
        $this->getJson('/api/group-roles')->assertOk();
        $few = $this->countQueries(fn () => $this->getJson('/api/group-roles')->assertOk());
        $makeGroups(6);
        $many = $this->countQueries(fn () => $this->getJson('/api/group-roles')->assertOk());

        $this->assertSame($few, $many);
    }

    public function test_removing_people_costs_the_same_queries_for_any_number_of_them(): void
    {
        $default = GroupRole::create(['name' => 'All Staff', 'role' => 'user']);
        AppSetting::put('default_employee_group_id', $default->id);
        $this->actingAs($this->super());

        $removeAll = function (string $name, int $count): int {
            $group = GroupRole::create(['name' => $name, 'role' => 'admin']);
            $ids = collect(range(1, $count))->map(fn ($n) => $this->person("{$name}{$n}", 'admin', $group)->id)->all();

            return $this->countQueries(fn () => $this->putJson("/api/group-roles/{$group->id}", [
                'name' => $name, 'role' => 'admin', 'add_ids' => [], 'remove_ids' => $ids,
            ])->assertOk());
        };

        $removeAll('Warm', 1);
        $few = $removeAll('Few', 3);
        $many = $removeAll('Many', 12);

        $this->assertSame($few, $many);
        $this->assertSame(16, $default->employees()->count());
        $this->assertSame(16, User::whereHas('role', fn ($q) => $q->where('key', 'user'))->count());
    }

    public function test_orphans_without_a_default_group_get_the_base_role(): void
    {
        $it = GroupRole::create(['name' => 'IT', 'role' => 'admin']);
        $sam = $this->person('Sam', 'admin', $it);
        $this->actingAs($this->super());

        $this->putJson("/api/group-roles/{$it->id}", ['name' => 'IT', 'role' => 'admin', 'add_ids' => [], 'remove_ids' => [$sam->id]])->assertOk();

        $this->assertSame('user', $this->accountRole($sam));
        $this->assertSame(0, DB::table('group_role_employee')->where('employee_id', $sam->id)->count());
    }

    public function test_the_update_answer_carries_the_new_role_and_the_callers_own_group(): void
    {
        $it = GroupRole::create(['name' => 'IT', 'role' => 'user']);
        $me = Employee::create(['first_name' => 'Me', 'last_name' => 'Test']);
        $it->employees()->attach($me->id);
        $this->actingAs(User::factory()->create(['role' => 'super', 'employee_id' => $me->id]));

        $this->putJson("/api/group-roles/{$it->id}", ['name' => 'IT Team', 'role' => 'user'])
            ->assertOk()
            ->assertJsonPath('data.name', 'IT Team')
            ->assertJsonPath('data.includes_me', true);

        $other = GroupRole::create(['name' => 'Other', 'role' => 'user']);
        $this->putJson("/api/group-roles/{$other->id}", ['name' => 'Other', 'role' => 'admin'])
            ->assertOk()
            ->assertJsonPath('data.role', 'admin')
            ->assertJsonPath('data.role_label', 'IT Support')
            ->assertJsonPath('data.includes_me', false);
    }

    public function test_a_groups_only_manager_gets_the_role_options(): void
    {
        $this->actingAs($this->userWith('system.manage_groups'));

        $roles = collect($this->getJson('/api/group-roles')->assertOk()->json('roles'))->keyBy('key');

        $this->assertSame(['key', 'name', 'color', 'is_super', 'permissions'], array_keys($roles['admin']));
        $this->assertSame('IT Support', $roles['admin']['name']);
        $this->assertSame('#3b82f6', $roles['admin']['color']);
        $this->assertFalse($roles['admin']['is_super']);
        $this->assertSame(['tickets.module'], $roles['admin']['permissions']);
        $this->assertTrue($roles['super']['is_super']);
        $this->assertSame(['system.manage_groups'], $roles['clerk']['permissions']);
    }

    public function test_the_role_options_need_manage_groups(): void
    {
        $this->actingAs($this->userWith('system.manage_roles', 'system.manage_permissions'));

        $this->getJson('/api/group-roles')->assertForbidden();
    }

    public function test_a_department_pick_counts_only_the_people_the_caller_may_add(): void
    {
        $it = Department::create(['name' => 'IT', 'tag' => 'IT']);
        $me = Employee::create(['first_name' => 'Mia', 'last_name' => 'Test', 'department_id' => $it->id]);
        $this->person('Ada', 'super', null, $it->id);
        $this->person('Sam', 'user', null, $it->id);
        $this->person('Tom', 'user', null, $it->id);
        $caller = $this->userWith('system.manage_groups');
        $caller->update(['employee_id' => $me->id]);

        $this->actingAs($caller)
            ->getJson("/api/group-roles-candidates?department_id={$it->id}&per_page=10")
            ->assertOk()
            ->assertJsonPath('meta.total', 4)
            ->assertJsonPath('meta.addable', 2);

        $caller->update(['employee_id' => null]);
        $this->actingAs(User::factory()->create(['role' => 'super', 'employee_id' => $me->id]))
            ->getJson("/api/group-roles-candidates?department_id={$it->id}&all=1")
            ->assertOk()
            ->assertJsonPath('meta.addable', 3);

        $this->getJson('/api/group-roles-candidates')
            ->assertOk()
            ->assertJsonMissingPath('meta.addable');
    }

    private function giveBaseRole(string ...$permissions): void
    {
        $base = Role::where('key', 'user')->first();
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $base->id, 'permission' => $permission, 'allowed' => true]);
        }
    }

    public function test_a_group_without_a_role_is_ceiling_checked_against_the_base_role(): void
    {
        $this->giveBaseRole('tickets.create');
        $it = GroupRole::create(['name' => 'IT', 'role' => 'admin']);
        $sam = $this->person('Sam', 'admin', $it);
        $this->actingAs($this->userWith('system.manage_groups'));

        $this->postJson('/api/group-roles', ['name' => 'Roleless', 'role' => null, 'employee_ids' => [$sam->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'grant_ceiling');
        $this->assertDatabaseMissing('group_roles', ['name' => 'Roleless']);

        $this->putJson("/api/group-roles/{$it->id}", ['name' => 'IT', 'role' => null])
            ->assertForbidden()
            ->assertJsonPath('code', 'grant_ceiling');
        $this->assertSame('admin', $it->fresh()->role->key);
        $this->assertSame('admin', $this->accountRole($sam));
    }

    public function test_a_caller_holding_the_base_roles_keys_may_use_a_group_without_a_role(): void
    {
        $this->giveBaseRole('tickets.create');
        $it = GroupRole::create(['name' => 'IT', 'role' => 'user']);
        $sam = $this->person('Sam', 'user', $it);
        $this->actingAs($this->userWith('system.manage_groups', 'tickets.create'));

        $this->postJson('/api/group-roles', ['name' => 'Roleless', 'role' => null, 'employee_ids' => [$sam->id]])->assertCreated();

        $this->assertSame('user', $this->accountRole($sam));
    }

    public function test_removing_people_into_a_default_group_above_the_ceiling_is_refused(): void
    {
        $default = GroupRole::create(['name' => 'All Staff', 'role' => 'admin']);
        AppSetting::put('default_employee_group_id', $default->id);
        $basics = GroupRole::create(['name' => 'Basics', 'role' => 'user']);
        $sam = $this->person('Sam', 'user', $basics);
        $this->actingAs($this->userWith('system.manage_groups'));

        $this->putJson("/api/group-roles/{$basics->id}", ['name' => 'Basics', 'role' => 'user', 'add_ids' => [], 'remove_ids' => [$sam->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'grant_ceiling');
        $this->deleteJson("/api/group-roles/{$basics->id}")
            ->assertForbidden()
            ->assertJsonPath('code', 'grant_ceiling');

        $this->assertSame([$sam->id], $basics->employees()->pluck('employees.id')->all());
        $this->assertSame('user', $this->accountRole($sam));
        $this->assertSame(0, $default->employees()->count());
    }

    public function test_removing_people_onto_a_base_role_above_the_ceiling_is_refused(): void
    {
        $this->giveBaseRole('tickets.create');
        $basics = GroupRole::create(['name' => 'Basics', 'role' => 'admin']);
        $sam = $this->person('Sam', 'admin', $basics);
        $this->actingAs($this->userWith('system.manage_groups'));

        $this->putJson("/api/group-roles/{$basics->id}", ['name' => 'Basics', 'role' => 'admin', 'add_ids' => [], 'remove_ids' => [$sam->id]])
            ->assertForbidden()
            ->assertJsonPath('code', 'grant_ceiling');

        $this->assertSame('admin', $this->accountRole($sam));
        $this->assertTrue($basics->employees()->whereKey($sam->id)->exists());
    }

    public function test_addable_is_zero_on_a_group_the_caller_may_not_add_to(): void
    {
        $it = Department::create(['name' => 'IT', 'tag' => 'IT']);
        $this->person('Sam', 'user', null, $it->id);
        $this->person('Tom', 'user', null, $it->id);
        $admins = GroupRole::create(['name' => 'Administrators', 'role' => 'super']);
        $support = GroupRole::create(['name' => 'Support', 'role' => 'admin']);
        $basics = GroupRole::create(['name' => 'Basics', 'role' => 'user']);
        $addable = fn (GroupRole $group) => $this->getJson("/api/group-roles-candidates?group_id={$group->id}&department_id={$it->id}")
            ->assertOk()
            ->json('meta.addable');

        $this->actingAs($this->userWith('system.manage_groups'));
        $this->assertSame(0, $addable($admins));
        $this->assertSame(0, $addable($support));
        $this->assertSame(2, $addable($basics));

        $this->actingAs($this->super());
        $this->assertSame(2, $addable($support));
    }
}
