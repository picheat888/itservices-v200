<?php

namespace Tests\Feature\Perf;

use App\Support\DefaultWorkflows;
use App\Support\Perf\Copy;
use App\Support\Perf\Org;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\EmployeeDepartmentSeeder;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\EmployeeSectionSeeder;
use Database\Seeders\MasterDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

// Feature tests for the perf Org step (sections, employees, users, role groups)
class OrgStepTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([EmployeeDepartmentSeeder::class, EmployeePositionSeeder::class, EmployeeSectionSeeder::class, MasterDataSeeder::class, DatabaseSeeder::class]);
    }

    public function test_builds_a_manager_tree_that_every_rung_can_resolve(): void
    {
        [$ctx, $db] = PerfImport::run([Copy::class, Org::class]);

        $titles = $db->table('positions')->pluck('title', 'id')->all();
        $emps = $db->table('employees')->get()->keyBy('id');
        $this->assertSame(100, $emps->count());
        $this->assertEqualsWithDelta(80, $emps->where('status', 'active')->count(), 3);

        $vp = $emps->first(fn ($e) => $titles[$e->position_id] === 'Vice President');
        $this->assertNotNull($vp);
        $this->assertSame($vp->id, $ctx->reg->get('vp_employee_id'));

        $managedBy = $emps->pluck('manager_id')->filter()->all();
        foreach ($emps as $e) {
            $this->assertNotSame($e->id, $e->manager_id);
            $line = [];
            for ($cur = $e, $hops = 0; $cur->manager_id !== null; $hops++) {
                $this->assertLessThan(10, $hops, 'manager line loops');
                $cur = $emps[$cur->manager_id];
                $line[] = $titles[$cur->position_id];
            }
            $this->assertSame($vp->id, $cur->id, 'line must end at the VP');
            if ($e->status === 'resigned') {
                $this->assertNotContains($e->id, $managedBy);
                $this->assertGreaterThanOrEqual('2023-11-01', $e->last_day);
                $this->assertLessThanOrEqual('2026-10-16', $e->last_day);
            }
            if ($e->status === 'active' && ! in_array($titles[$e->position_id], [...DefaultWorkflows::RUNGS['supervisor'], ...DefaultWorkflows::RUNGS['manager'], 'Vice President'], true)) {
                $this->assertNotEmpty(array_intersect($line, DefaultWorkflows::RUNGS['supervisor']));
                $this->assertNotEmpty(array_intersect($line, DefaultWorkflows::RUNGS['manager']));
                $this->assertContains('Vice President', $line);
            }
        }
    }

    public function test_users_cover_it_staff_and_every_chain_approver(): void
    {
        [$ctx, $db] = PerfImport::run([Copy::class, Org::class]);

        $roles = DB::table('roles')->pluck('id', 'key');
        $titles = $db->table('positions')->pluck('title', 'id')->all();
        $this->assertGreaterThanOrEqual(15, $db->table('users')->count());
        $this->assertSame(15, $db->table('users')->where('role_id', $roles['admin'])->count());
        $this->assertGreaterThanOrEqual(3, $db->table('users')->where('role_id', $roles['hr'])->count());
        $this->assertTrue(Hash::check('Password1!', Org::PASSWORD_HASH));

        $chain = [...DefaultWorkflows::RUNGS['supervisor'], ...DefaultWorkflows::RUNGS['manager'], 'Vice President'];
        $holders = $db->table('employees')->where('status', 'active')->get()->filter(fn ($e) => in_array($titles[$e->position_id], $chain, true));
        foreach ($holders as $e) {
            $this->assertTrue($db->table('users')->where('employee_id', $e->id)->exists(), "chain holder {$e->id} has no user");
        }

        foreach ($db->table('users')->where('id', '!=', $ctx->reg->get('admin_user_id'))->get() as $u) {
            $groupRole = $db->table('group_role_employee')->where('employee_id', $u->employee_id)->join('group_roles', 'group_roles.id', '=', 'group_role_employee.group_role_id')->value('group_roles.role_id');
            $this->assertSame((int) $u->role_id, (int) $groupRole);
        }
    }

    public function test_emails_and_codes_are_unique(): void
    {
        [, $db] = PerfImport::run([Copy::class, Org::class]);

        foreach (['employees' => ['code', 'email', 'username'], 'users' => ['email', 'username']] as $table => $columns) {
            foreach ($columns as $column) {
                $values = $db->table($table)->whereNotNull($column)->pluck($column);
                $this->assertSame($values->count(), $values->unique()->count(), "{$table}.{$column} has duplicates");
            }
        }
        $this->assertSame(5, $db->table('warehouses')->count());
        $this->assertSame(15, $db->table('locations')->count());
        $this->assertGreaterThanOrEqual(15, $db->table('sections')->count());
    }
}
