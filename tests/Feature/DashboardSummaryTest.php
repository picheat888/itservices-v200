<?php

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\RolePermission;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The front page's own endpoint.
 *
 * It replaces four hard-coded KPI numbers and a table of four invented tickets, so the point
 * of every assertion here is the same one: what the page shows belongs to the person reading
 * it and exists in the database.
 */
class DashboardSummaryTest extends TestCase
{
    use RefreshDatabase;

    private function staff(string $firstName = 'Somchai'): User
    {
        $employee = Employee::create(['first_name' => $firstName, 'status' => 'active']);

        return User::factory()->create(['employee_id' => $employee->id]);
    }

    public function test_it_counts_and_lists_only_the_readers_own_work(): void
    {
        $me = $this->staff();
        $someoneElse = $this->staff('Manee');

        Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'open', 'subject' => 'My broken laptop']);
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'in_progress']);
        Ticket::factory()->create(['requester_id' => $someoneElse->employee_id, 'status' => 'open', 'subject' => 'Not mine']);
        // Closed cases leave the "open" count and land in the month's tally instead.
        Ticket::factory()->create([
            'requester_id' => $me->employee_id, 'status' => 'completed', 'resolved_at' => now(),
        ]);

        $body = $this->actingAs($me)->getJson('/api/dashboard/summary')->assertOk()->json('data.mine');

        $this->assertSame(2, $body['kpi']['open_tickets']);
        $this->assertSame(1, $body['kpi']['resolved_this_month']);
        $this->assertCount(2, $body['tickets']);
        $this->assertContains('My broken laptop', array_column($body['tickets'], 'subject'));
        $this->assertNotContains('Not mine', array_column($body['tickets'], 'subject'));
    }

    /** A case closed in an earlier month is not this month's news. */
    public function test_the_monthly_tally_stops_at_the_start_of_the_month(): void
    {
        $me = $this->staff();
        Ticket::factory()->create([
            'requester_id' => $me->employee_id, 'status' => 'completed', 'resolved_at' => now()->startOfMonth()->subDay(),
        ]);

        $body = $this->actingAs($me)->getJson('/api/dashboard/summary')->assertOk()->json('data.mine');

        $this->assertSame(0, $body['kpi']['resolved_this_month']);
    }

    /**
     * The assets waiting to be accepted come back as rows, not a number: this is the one
     * block on the page that asks the reader to do something.
     */
    public function test_assets_waiting_to_be_accepted_are_listed_separately(): void
    {
        $me = $this->staff();
        Asset::factory()->create(['owner_employee_id' => $me->employee_id, 'status' => 'pending_acceptance', 'asset_code' => 'PC-9001']);
        Asset::factory()->create(['owner_employee_id' => $me->employee_id, 'status' => 'deployed']);
        Asset::factory()->create(['owner_employee_id' => null, 'status' => 'pending_acceptance']);

        $body = $this->actingAs($me)->getJson('/api/dashboard/summary')->assertOk()->json('data.mine');

        $this->assertCount(1, $body['pending_acceptance']);
        $this->assertSame('PC-9001', $body['pending_acceptance'][0]['asset_code']);
        // Both still count as the reader's kit — one of them just has not been accepted yet.
        $this->assertSame(2, $body['kpi']['assets']);
    }

    /** A request filed on somebody's behalf is theirs to watch, not only the filer's. */
    public function test_a_request_filed_for_the_reader_counts_as_theirs(): void
    {
        $me = $this->staff();
        $hr = $this->staff('Ratana');

        ServiceRequest::create([
            'reference' => 'RQ-2026-9001', 'type' => 'computer', 'origin' => 'onboarding',
            'user_id' => $hr->id, 'employee_id' => $me->employee_id,
            'requester_name' => 'Somchai', 'title' => 'Computer for Somchai',
            'reason' => 'New starter needs a machine.', 'status' => 'pending',
        ]);

        $body = $this->actingAs($me)->getJson('/api/dashboard/summary')->assertOk()->json('data.mine');

        $this->assertSame(1, $body['kpi']['pending_requests']);
        $this->assertSame('RQ-2026-9001', $body['requests'][0]['reference']);
    }

    /**
     * The administrator account has no employee record, so it owns none of this. It must get
     * the same shape back with nothing in it — an endpoint that 500s or omits keys would take
     * the whole front page down for the one account that can fix things.
     */
    public function test_an_account_with_no_employee_record_gets_an_empty_page_not_an_error(): void
    {
        $admin = User::factory()->create(['employee_id' => null]);

        $body = $this->actingAs($admin)->getJson('/api/dashboard/summary')->assertOk()->json('data.mine');

        $this->assertSame(0, $body['kpi']['open_tickets']);
        $this->assertSame([], $body['tickets']);
        $this->assertSame([], $body['pending_acceptance']);
        $this->assertSame([], $body['requests']);
        $this->assertSame([], $body['assets']);
    }

    public function test_it_needs_a_signed_in_account(): void
    {
        $this->getJson('/api/dashboard/summary')->assertUnauthorized();
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

    /**
     * A block the reader may not see is absent, not empty.
     *
     * The page draws a section from whether its key arrived, so an empty array would render
     * an IT report — headed, bordered and blank — for somebody with no business seeing one.
     */
    public function test_a_reader_without_the_rights_gets_no_it_hr_or_activity_block(): void
    {
        $plain = $this->staff();

        $body = $this->actingAs($plain)->getJson('/api/dashboard/summary')->assertOk()->json('data');

        $this->assertArrayHasKey('mine', $body);
        $this->assertArrayNotHasKey('it', $body);
        $this->assertArrayNotHasKey('hr', $body);
        $this->assertArrayNotHasKey('activity', $body);
    }

    public function test_the_it_block_splits_the_window_and_names_who_is_carrying_what(): void
    {
        $dispatcher = $this->staffWith(['tickets.view_all']);
        $tech = $this->staff('Tech');

        Ticket::factory()->create(['status' => 'open', 'assignee_id' => null]);
        Ticket::factory()->create(['status' => 'in_progress', 'assignee_id' => $tech->id]);
        Ticket::factory()->create(['status' => 'completed', 'assignee_id' => $tech->id, 'resolved_at' => now()]);
        // Older than the window: out of the split, though still an open case somebody holds.
        Ticket::factory()->create(['status' => 'open', 'assignee_id' => $tech->id, 'created_at' => now()->subDays(60)]);

        $it = $this->actingAs($dispatcher)->getJson('/api/dashboard/summary')->assertOk()->json('data.it');

        $this->assertSame(30, $it['window_days']);
        $this->assertSame(['open' => 1, 'in_progress' => 1, 'completed' => 1, 'canceled' => 0], $it['by_status']);

        $rows = collect($it['workload']);
        // The unassigned pile is a row of its own — a queue nobody owns is the point of the card.
        $this->assertNotNull($rows->firstWhere('assignee_id', null));
        $mine = $rows->firstWhere('assignee_id', $tech->id);
        $this->assertSame(2, $mine['open']);   // in-progress + the old open one
        $this->assertSame(1, $mine['closed']);
        // The row carries the account's name, so the card can be read without a second lookup.
        $this->assertSame($tech->name, $mine['name']);
    }

    /**
     * Two weeks of flow: what arrived each day, and what was still open when the day ended.
     *
     * The backlog is the half that could be got wrong quietly — it is a level rebuilt from
     * two timestamps, not a row count, so the assertions walk specific days rather than
     * checking a total.
     */
    public function test_the_volume_series_counts_arrivals_and_rebuilds_the_backlog(): void
    {
        $dispatcher = $this->staffWith(['tickets.view_all']);

        // Filed before the window and still open: the opening balance the walk starts from.
        Ticket::factory()->create(['status' => 'open', 'created_at' => now()->subDays(30)]);
        // Filed before the window and closed inside it: leaves the backlog on the day it closed.
        Ticket::factory()->create([
            'status' => 'completed', 'created_at' => now()->subDays(30), 'resolved_at' => now()->subDays(3),
        ]);
        // Opened and closed on the same day: it arrived, and it is not carried overnight.
        Ticket::factory()->create([
            'status' => 'completed', 'created_at' => now()->subDays(5), 'resolved_at' => now()->subDays(5),
        ]);

        $it = $this->actingAs($dispatcher)->getJson('/api/dashboard/summary')->assertOk()->json('data.it');

        $this->assertSame(14, $it['volume_days']);
        $this->assertCount(14, $it['volume']);
        $this->assertSame(now()->startOfDay()->subDays(13)->toDateString(), $it['volume'][0]['date']);
        $this->assertSame(now()->toDateString(), $it['volume'][13]['date']);

        $byDate = collect($it['volume'])->keyBy('date');
        // Two open at the start of the window, and neither of the pre-window pair arrived in it.
        $this->assertSame(0, $byDate[now()->subDays(13)->toDateString()]['opened']);
        $this->assertSame(2, $byDate[now()->subDays(13)->toDateString()]['backlog']);
        // The same-day case counts as an arrival but leaves the backlog untouched that night.
        $this->assertSame(1, $byDate[now()->subDays(5)->toDateString()]['opened']);
        $this->assertSame(2, $byDate[now()->subDays(5)->toDateString()]['backlog']);
        // The old case closes on day -3 and the backlog drops with it.
        $this->assertSame(1, $byDate[now()->subDays(3)->toDateString()]['backlog']);
        $this->assertSame(1, $byDate[now()->toDateString()]['backlog']);
    }

    public function test_the_hr_block_counts_staff_and_the_onboarding_queue(): void
    {
        $hrUser = $this->staffWith(['employees.view_dashboard']);
        $department = Department::create(['code' => 'DEP-9001', 'tag' => 'IT9', 'name' => 'Information Technology']);

        Employee::create(['first_name' => 'New', 'status' => 'active', 'joined_at' => now(), 'department_id' => $department->id]);
        Employee::create(['first_name' => 'Gone', 'status' => 'resigned', 'last_day' => now()]);

        ServiceRequest::create([
            'reference' => 'RQ-2026-9100', 'type' => 'computer', 'origin' => 'onboarding',
            'user_id' => $hrUser->id, 'requester_name' => 'New', 'title' => 'Computer for New',
            'reason' => 'Starts on Monday.', 'status' => 'pending',
        ]);

        $hr = $this->actingAs($hrUser)->getJson('/api/dashboard/summary')->assertOk()->json('data.hr');

        $this->assertSame(1, $hr['kpi']['new_this_month']);
        $this->assertSame(1, $hr['kpi']['pending_onboarding']);
        $this->assertSame(1, $hr['kpi']['resigned_this_month']);
        // Resigned staff are not headcount; the HR user and the two actives are.
        $this->assertSame(Employee::where('status', 'active')->count(), $hr['kpi']['headcount']);

        $this->assertSame('New', $hr['recent_hires'][0]['name']);
        $this->assertSame('Information Technology', $hr['recent_hires'][0]['department']);
        // Departments with nobody in them are left out rather than drawn as empty bars.
        $this->assertSame([['id' => $department->id, 'name' => 'Information Technology', 'name_th' => null, 'count' => 1]], $hr['headcount_by_department']);
    }

    /** The feed is the audit log in short form, so it answers to the audit log's own right. */
    public function test_the_activity_feed_needs_the_audit_right(): void
    {
        AuditLog::record('Created employee', 'Somchai');

        $withoutRight = $this->staff();
        $this->actingAs($withoutRight)->getJson('/api/dashboard/summary')->assertOk()->assertJsonMissingPath('data.activity');

        $auditor = $this->staffWith(['system.view_audit']);
        $feed = $this->actingAs($auditor)->getJson('/api/dashboard/summary')->assertOk()->json('data.activity');

        $this->assertSame('Created employee', $feed[0]['action']);
        $this->assertSame('Somchai', $feed[0]['target']);
    }

    /** A request row with the bare fields the block reads. */
    private function request(string $reference, string $type, string $status, array $extra = []): ServiceRequest
    {
        return ServiceRequest::create([
            'reference' => $reference, 'type' => $type, 'origin' => 'direct',
            'requester_name' => 'Somchai', 'title' => "Request {$reference}",
            'reason' => 'Needed for work.', 'status' => $status,
        ] + $extra);
    }

    public function test_the_requests_block_needs_the_view_all_right(): void
    {
        $plain = $this->staff();

        $body = $this->actingAs($plain)->getJson('/api/dashboard/summary')->assertOk()->json('data');

        $this->assertArrayNotHasKey('requests', $body);
    }

    public function test_the_requests_block_splits_the_window_by_status_and_type(): void
    {
        $overseer = $this->staffWith(['requests.view_all']);

        $this->request('RQ-2026-0001', 'computer', 'pending');
        $this->request('RQ-2026-0002', 'computer', 'approved');
        $this->request('RQ-2026-0003', 'email', 'rejected');
        // Older than the window: out of both splits.
        $old = $this->request('RQ-2026-0004', 'email', 'completed');
        $old->forceFill(['created_at' => now()->subDays(60)])->save();

        $block = $this->actingAs($overseer)->getJson('/api/dashboard/summary')->assertOk()->json('data.requests');

        $this->assertSame(30, $block['window_days']);
        $this->assertSame(['pending' => 1, 'approved' => 1, 'rejected' => 1, 'completed' => 0, 'cancelled' => 0], $block['by_status']);
        // Busiest type first.
        $this->assertSame([['type' => 'computer', 'count' => 2], ['type' => 'email', 'count' => 1]], $block['by_type']);
    }

    /**
     * "Waiting" is the stalled-reminder set: a current step past the nudge threshold. A step
     * that became current yesterday is not waiting yet, and the longest wait is listed first.
     */
    public function test_the_requests_block_lists_steps_that_have_waited_too_long(): void
    {
        $overseer = $this->staffWith(['requests.view_all']);

        $step = fn (ServiceRequest $request, string $name, int $daysAgo) => RequestApproval::create([
            'service_request_id' => $request->id, 'position' => 1, 'actor_type' => 'chain', 'kind' => 'approval',
            'label' => 'Manager', 'approver_name' => $name, 'status' => 'current', 'became_current_at' => now()->subDays($daysAgo),
        ]);
        $step($this->request('RQ-2026-0101', 'computer', 'pending'), 'Manee', 5);
        $step($this->request('RQ-2026-0102', 'mobile', 'pending'), 'Somsak', 9);
        $step($this->request('RQ-2026-0103', 'email', 'pending'), 'Fresh', 1);

        $block = $this->actingAs($overseer)->getJson('/api/dashboard/summary')->assertOk()->json('data.requests');

        $this->assertSame(3, $block['waiting_after_days']);
        $this->assertSame(2, $block['waiting_count']);
        $this->assertSame(['RQ-2026-0102', 'RQ-2026-0101'], array_column($block['waiting'], 'reference'));
        $this->assertSame('Somsak', $block['waiting'][0]['waiting_on']);
        $this->assertSame(9, $block['waiting'][0]['days']);
    }
}
