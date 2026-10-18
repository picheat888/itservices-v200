<?php

namespace Tests\Feature;

use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Access\AccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The combined sidebar badge endpoint: it must report the same numbers the individual
 * module endpoints do (that is the whole point of folding them into one request), and
 * it must not leak a count the caller has no permission for.
 */
class SidebarBadgeTest extends TestCase
{
    use RefreshDatabase;

    /** Seeds one "needs attention" item per badge and returns the user who requested/holds them. */
    private function seedWorkForEveryBadge(): User
    {
        $employee = Employee::create(['code' => 'SB-0001', 'first_name' => 'Badge', 'last_name' => 'Owner', 'status' => 'active']);
        $user = User::factory()->create(['role' => 'super', 'employee_id' => $employee->id]);

        // employees: one active hire still without a login account
        Employee::create(['code' => 'SB-0002', 'first_name' => 'No', 'last_name' => 'Account', 'status' => 'active']);

        // contracts: one already past its end date and still live
        Contract::create([
            'vendor' => 'ACME', 'name' => 'Overdue', 'type' => 'software',
            'start_date' => now()->subYears(2), 'end_date' => now()->subDays(5),
            'value' => 1000, 'billing_cycle' => 'yearly',
        ]);

        // assets: one waiting for IT receipt, one waiting for this user's acceptance
        Asset::create(['asset_code' => 'SB-AS-01', 'type' => 'laptop', 'status' => 'pending_return']);
        Asset::create([
            'asset_code' => 'SB-AS-02', 'type' => 'laptop', 'status' => 'pending_acceptance',
            'owner_employee_id' => $employee->id,
        ]);

        // tickets: one open case this user filed
        Ticket::factory()->create(['requester_id' => $employee->id, 'status' => 'open', 'assignee_id' => null]);

        // access: an email group with no members and no owner (2 anomalies), plus a
        // resigned employee still holding an active grant on a file share (1 more).
        EmailGroup::create(['name' => 'Orphan', 'email' => 'orphan@x.test']);
        $share = FileShare::create(['name' => 'Shared', 'path' => '\\\\F\\S', 'owner_employee_id' => $employee->id]);
        $resigned = Employee::create(['code' => 'SB-0003', 'first_name' => 'Gone', 'last_name' => 'Away', 'status' => 'resigned']);
        app(AccessService::class)->grant($share, $resigned->id, ['access_level' => 'Member']);

        // stock: one out-of-stock SKU, one pending request, one open count session
        $item = StockItem::create(['sku' => 'SB-SKU', 'name' => 'SB', 'unit' => 'pcs', 'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 10]);
        StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $user->id,
            'requester_name' => 'Badge Owner', 'qty' => 1, 'reason' => 'test', 'status' => 'pending',
        ]);
        StockCount::create(['status' => 'draft', 'counted_by' => $user->id]);

        return $user;
    }

    public function test_every_count_matches_the_module_endpoint_it_replaces(): void
    {
        $this->actingAs($this->seedWorkForEveryBadge());

        $badges = $this->getJson('/api/sidebar-badges')->assertOk()->json('data');

        $employees = $this->getJson('/api/employees/summary')->assertOk();
        $contracts = $this->getJson('/api/contracts/summary')->assertOk();
        $assets = $this->getJson('/api/assets/summary')->assertOk();
        $tickets = $this->getJson('/api/tickets/badge')->assertOk();
        $access = $this->getJson('/api/access/dashboard')->assertOk()->json('data.governance');
        $stock = $this->getJson('/api/stock-items/summary')->assertOk();
        $requests = $this->getJson('/api/stock-requests?page=1')->assertOk();
        $counts = $this->getJson('/api/stock-counts?page=1')->assertOk();

        $this->assertSame($employees->json('no_account'), $badges['employees']);
        $this->assertSame($contracts->json('expiring') + $contracts->json('overdue'), $badges['contracts']);
        $this->assertSame($assets->json('pending_return'), $badges['assets']);
        $this->assertSame($tickets->json('count'), $badges['tickets']);
        $this->assertSame(
            $access['empty_resources'] + $access['no_owner'] + $access['resigned_holders'],
            $badges['access'],
        );
        $this->assertSame(
            $stock->json('out_count') + $stock->json('low_count') + $stock->json('over_count') + $stock->json('dead_count')
                + $requests->json('meta.outstanding') + $counts->json('meta.draft'),
            $badges['stock'],
        );

        // My Assets has no summary endpoint — compare against the list the page itself renders.
        $mine = collect($this->getJson('/api/assets/mine')->assertOk()->json('data'))
            ->where('status', 'pending_acceptance')->count();
        $this->assertSame($mine, $badges['my_assets']);

        // The seeded work must actually register, otherwise the parity above is all zeros.
        $this->assertSame(1, $badges['employees']);
        $this->assertSame(1, $badges['contracts']);
        $this->assertSame(1, $badges['assets']);
        $this->assertSame(1, $badges['my_assets']);
        $this->assertSame(1, $badges['tickets']);
        $this->assertSame(3, $badges['stock']);
        // Orphan group (no member + no owner) + the resigned grant holder.
        $this->assertSame(3, $badges['access']);
    }

    public function test_an_approval_waiting_on_me_counts_towards_the_requests_badge(): void
    {
        $user = $this->seedWorkForEveryBadge();

        // A request whose current step is this user's to decide. This count had no test,
        // which is how the sidebar dropping it went unnoticed for so long. Somebody else's
        // request: nobody decides their own (RequestApproval::scopeActionableBy).
        $asker = Employee::create(['first_name' => 'Asker', 'last_name' => 'Badge', 'status' => 'active']);
        $request = ServiceRequest::create([
            'type' => 'computer', 'employee_id' => $asker->id,
            'requester_name' => 'Asker Badge', 'title' => 'Laptop', 'reason' => 'Testing', 'status' => 'pending',
        ]);
        $request->approvals()->create([
            'position' => 1, 'actor_type' => 'chain', 'kind' => 'approval', 'label' => 'Manager',
            'approver_employee_id' => $user->employee_id, 'approver_name' => 'Badge Owner', 'status' => 'current',
        ]);

        $badges = $this->actingAs($user)->getJson('/api/sidebar-badges')->assertOk()->json('data');

        $this->assertSame(1, $badges['requests']);
    }

    public function test_the_requests_badge_opens_on_the_module_key_not_the_right_to_file(): void
    {
        $approver = Employee::create(['first_name' => 'Module', 'last_name' => 'Only', 'status' => 'active']);
        $asker = Employee::create(['first_name' => 'Asker', 'last_name' => 'Badge', 'status' => 'active']);
        $request = ServiceRequest::create([
            'type' => 'computer', 'employee_id' => $asker->id,
            'requester_name' => 'Asker Badge', 'title' => 'Laptop', 'reason' => 'Testing', 'status' => 'pending',
        ]);
        $request->approvals()->create([
            'position' => 1, 'actor_type' => 'chain', 'kind' => 'approval', 'label' => 'Manager',
            'approver_employee_id' => $approver->id, 'approver_name' => 'Module Only', 'status' => 'current',
        ]);
        $userWith = function (string $key, string $permission) use ($approver): User {
            $role = Role::create(['key' => $key, 'name' => $key, 'is_system' => false]);
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);

            return User::factory()->create(['role_id' => $role->id, 'employee_id' => $approver->id]);
        };

        $moduleOnly = $userWith('sb_req_module', 'requests.module');
        $this->assertSame(1, $this->actingAs($moduleOnly)->getJson('/api/sidebar-badges')->assertOk()->json('data.requests'));

        $moduleOnly->delete();
        $submitOnly = $userWith('sb_req_submit', 'requests.submit');
        $this->assertSame(0, $this->actingAs($submitOnly)->getJson('/api/sidebar-badges')->assertOk()->json('data.requests'));
    }

    public function test_counts_the_user_may_not_see_come_back_as_zero(): void
    {
        $this->seedWorkForEveryBadge();

        // A signed-in user with no module permissions at all.
        $role = Role::create(['key' => 'sb_none', 'name' => 'No Access', 'is_system' => false]);
        RolePermission::create(['role_id' => $role->id, 'permission' => 'tickets.create', 'allowed' => true]);
        $limited = User::factory()->create(['role_id' => $role->id]);

        $badges = $this->actingAs($limited)->getJson('/api/sidebar-badges')->assertOk()->json('data');

        $this->assertSame(0, $badges['employees']);
        $this->assertSame(0, $badges['contracts']);
        $this->assertSame(0, $badges['assets']);
        $this->assertSame(0, $badges['my_assets']);
        $this->assertSame(0, $badges['access']);
        $this->assertSame(0, $badges['stock']);
        $this->assertSame(0, $badges['requests']);
        // tickets.create is granted, but this user filed nothing and may not take cases.
        $this->assertSame(0, $badges['tickets']);
    }

    public function test_the_tickets_badge_opens_on_any_key_that_shows_the_tickets_menu(): void
    {
        $userWith = function (string $key, ?string $permission): User {
            $employee = Employee::create(['code' => 'SB-T-'.$key, 'first_name' => 'Ticket', 'last_name' => $key, 'status' => 'active']);
            $role = Role::create(['key' => 'sb_t_'.$key, 'name' => 'Tickets '.$key, 'is_system' => false]);
            if ($permission !== null) {
                RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
            }
            Ticket::factory()->create(['requester_id' => $employee->id, 'status' => 'open', 'assignee_id' => null]);

            return User::factory()->create(['role_id' => $role->id, 'employee_id' => $employee->id]);
        };

        foreach (['tickets.my', 'tickets.create', 'tickets.module'] as $permission) {
            $user = $userWith(str_replace('.', '_', $permission), $permission);
            $this->assertSame(1, $this->actingAs($user)->getJson('/api/sidebar-badges')->assertOk()->json('data.tickets'), $permission);
        }

        $none = $userWith('none', null);
        $this->assertSame(0, $this->actingAs($none)->getJson('/api/sidebar-badges')->assertOk()->json('data.tickets'));
    }

    public function test_my_assets_counts_for_a_linked_employee_with_no_permissions(): void
    {
        $employee = Employee::create(['code' => 'SB-0100', 'first_name' => 'Plain', 'last_name' => 'Staff', 'status' => 'active']);
        $role = Role::create(['key' => 'sb_plain', 'name' => 'Plain', 'is_system' => false]);
        $plain = User::factory()->create(['role_id' => $role->id, 'employee_id' => $employee->id]);
        Asset::create([
            'asset_code' => 'SB-AS-10', 'type' => 'laptop', 'status' => 'pending_acceptance',
            'owner_employee_id' => $employee->id,
        ]);

        $badges = $this->actingAs($plain)->getJson('/api/sidebar-badges')->assertOk()->json('data');

        $this->assertSame(1, $badges['my_assets']);
        $this->assertSame(0, $badges['assets']);
    }
}
