<?php

namespace Tests\Feature;

use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The front page's endpoint: which blocks arrive is decided by the Dashboard switches alone.
 */
class DashboardSummaryTest extends TestCase
{
    use RefreshDatabase;

    private function staff(string $firstName = 'Somchai'): User
    {
        $employee = Employee::create(['first_name' => $firstName, 'status' => 'active']);

        return User::factory()->create(['employee_id' => $employee->id]);
    }

    /** An account granted exactly the given permissions, with an employee record. */
    private function staffWith(array $permissions): User
    {
        $user = $this->staff('Perm');
        foreach ($permissions as $key) {
            RolePermission::firstOrCreate(['role_id' => $user->role_id, 'permission' => $key], ['allowed' => true]);
        }

        return $user->refresh();
    }

    /** @return list<string> */
    private function blocksFor(User $user): array
    {
        return array_keys($this->actingAs($user)->getJson('/api/dashboard/summary')->assertOk()->json('data'));
    }

    public function test_it_needs_a_signed_in_account(): void
    {
        $this->getJson('/api/dashboard/summary')->assertUnauthorized();
    }

    /** A block the reader may not see is absent, not empty. */
    public function test_a_reader_without_switches_gets_only_the_mine_block(): void
    {
        $this->assertSame(['mine'], $this->blocksFor($this->staff()));
    }

    /** @return array<string, array{string, string}> */
    public static function switches(): array
    {
        return [
            'it' => ['dashboard.view_it', 'it'],
            'requests' => ['dashboard.view_requests', 'requests'],
            'contracts' => ['dashboard.view_contracts', 'contracts'],
            'hr' => ['dashboard.view_hr', 'hr'],
            'activity' => ['dashboard.view_activity', 'activity'],
        ];
    }

    #[DataProvider('switches')]
    public function test_each_switch_sends_its_own_block(string $permission, string $block): void
    {
        $this->assertSame(['mine', $block], $this->blocksFor($this->staffWith([$permission])));
    }

    /** The switches stand alone: module rights neither grant a section nor are needed for one. */
    public function test_the_module_rights_alone_send_no_dashboard_block(): void
    {
        $user = $this->staffWith(['tickets.view_all', 'requests.view_all', 'contracts.module', 'employees.view_dashboard', 'system.view_audit']);

        $this->assertSame(['mine'], $this->blocksFor($user));
    }

    public function test_the_super_admin_sees_every_block(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $super = User::factory()->create(['role' => 'super', 'employee_id' => null]);

        $this->assertSame(['mine', 'it', 'requests', 'contracts', 'hr', 'activity'], $this->blocksFor($super));
    }

    /** The administrator account has no employee record; the page still needs the full shape. */
    public function test_an_account_with_no_employee_record_gets_the_mine_shape_not_an_error(): void
    {
        $admin = User::factory()->create(['employee_id' => null]);

        $mine = $this->actingAs($admin)->getJson('/api/dashboard/summary')->assertOk()->json('data.mine');

        $this->assertSame(['kpi', 'todo', 'tickets', 'tickets_total', 'requests', 'requests_total'], array_keys($mine));
    }
}
