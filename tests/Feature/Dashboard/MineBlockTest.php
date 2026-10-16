<?php

namespace Tests\Feature\Dashboard;

use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\Software;
use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Dashboard\MineBlock;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The "ของฉัน" block and the reader's own tiles under "งานที่รอคุณ". */
class MineBlockTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
    }

    private function staff(string $firstName = 'Somchai'): User
    {
        $employee = Employee::create(['first_name' => $firstName, 'status' => 'active']);

        return User::factory()->create(['employee_id' => $employee->id]);
    }

    private function mine(User $user): array
    {
        return app(MineBlock::class)->build($user);
    }

    private function request(string $reference, string $status, array $extra = []): ServiceRequest
    {
        return ServiceRequest::create([
            'reference' => $reference, 'type' => 'computer', 'origin' => 'direct',
            'requester_name' => 'Somchai', 'title' => "Request {$reference}",
            'reason' => 'Needed for work.', 'status' => $status,
        ] + $extra);
    }

    public function test_open_tickets_split_by_status_and_the_month_tally(): void
    {
        $me = $this->staff();
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'open']);
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'in_progress']);
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'completed', 'resolved_at' => now()]);
        Ticket::factory()->create(['requester_id' => $me->employee_id, 'status' => 'completed', 'resolved_at' => now()->startOfMonth()->subDay()]);
        Ticket::factory()->create(['requester_id' => $this->staff('Manee')->employee_id, 'status' => 'open']);

        $mine = $this->mine($me);

        $this->assertSame(2, $mine['kpi']['open_tickets']);
        $this->assertSame(['open' => 1, 'in_progress' => 1], $mine['kpi']['open_split']);
        $this->assertSame(1, $mine['kpi']['closed_this_month']);
        $this->assertSame(2, $mine['tickets_total']);
        $this->assertCount(2, $mine['tickets']);
    }

    public function test_requests_count_filed_by_for_or_on_behalf_of_the_reader(): void
    {
        $me = $this->staff();
        $hr = $this->staff('Ratana');
        $this->request('RQ-2026-0001', 'pending', ['user_id' => $me->id]);
        $this->request('RQ-2026-0002', 'approved', ['user_id' => $hr->id, 'employee_id' => $me->employee_id]);
        $this->request('RQ-2026-0003', 'completed', ['user_id' => $me->id]);
        $this->request('RQ-2026-0004', 'pending', ['user_id' => $hr->id]);

        $mine = $this->mine($me);

        $this->assertSame(2, $mine['kpi']['requests_unfinished']);
        $this->assertSame(['pending' => 1, 'approved' => 1], $mine['kpi']['requests_split']);
        // The card lists every status, newest first.
        $this->assertSame(3, $mine['requests_total']);
        $this->assertSame(['RQ-2026-0003', 'RQ-2026-0002', 'RQ-2026-0001'], array_column($mine['requests'], 'reference'));
    }

    public function test_assets_and_access_count_what_the_reader_holds(): void
    {
        $me = $this->staff();
        Asset::factory()->create(['owner_employee_id' => $me->employee_id, 'status' => 'deployed']);
        Asset::factory()->create(['owner_employee_id' => $me->employee_id, 'status' => 'pending_acceptance', 'asset_code' => 'PC-9001']);
        Asset::factory()->create(['owner_employee_id' => $me->employee_id, 'status' => 'ready']);

        $grant = fn (Model $resource, array $extra = []) => AccessMembership::create([
            'resource_type' => $resource->getMorphClass(), 'resource_id' => $resource->getKey(),
            'employee_id' => $me->employee_id, 'granted_at' => now(), 'granted_by' => $me->id, 'purpose' => 'Daily work', ...$extra,
        ]);
        $grant(EmailGroup::create(['name' => 'Production Team', 'email' => 'prod@x.co']));
        $grant(Software::create(['name' => 'AutoCAD', 'license_type' => 'subscription', 'seats' => 10]));
        $grant(Software::create(['name' => 'Visio', 'license_type' => 'subscription', 'seats' => 5]), ['revoked_at' => now()]);

        $mine = $this->mine($me);

        $this->assertSame(2, $mine['kpi']['assets']);
        $this->assertSame(1, $mine['kpi']['assets_pending']);
        $this->assertSame(2, $mine['kpi']['access_total']);
        $this->assertSame(['email_group' => 1, 'file_share' => 0, 'social_platform' => 0, 'software' => 1], $mine['kpi']['access_by_type']);
        $this->assertSame('PC-9001', $mine['todo']['pending_acceptance'][0]['asset_code']);
    }

    public function test_my_jobs_split_the_cases_i_hold_by_sla_state(): void
    {
        $me = $this->staff();
        $case = fn (array $attributes) => Ticket::factory()->create([
            'assignee_id' => $me->id, 'status' => 'in_progress', 'responded_at' => now()->subHour(), ...$attributes,
        ]);
        $case(['sla_resolve_due_at' => now()->subHour()]);
        $case(['sla_resolve_due_at' => now()->addHours(5)]);
        $case(['sla_resolve_due_at' => now()->addDays(3)]);
        // No deadline: nothing to miss, so it counts as on time.
        $case(['sla_resolve_due_at' => null]);
        $case(['status' => 'completed', 'resolved_at' => now(), 'sla_resolve_due_at' => now()->subHour()]);

        $this->assertSame(['total' => 4, 'over_sla' => 1, 'due_soon' => 1, 'on_track' => 2], $this->mine($me)['todo']['my_jobs']);
    }

    public function test_approvals_count_only_current_steps_waiting_on_the_reader(): void
    {
        $me = $this->staff();
        $someone = $this->staff('Manee');
        $step = fn (ServiceRequest $request, int $approver, string $status, int $daysAgo) => RequestApproval::create([
            'service_request_id' => $request->id, 'position' => 1, 'actor_type' => 'chain', 'kind' => 'approval',
            'label' => 'Manager', 'approver_employee_id' => $approver, 'approver_name' => 'Approver',
            'status' => $status, 'became_current_at' => now()->subDays($daysAgo),
        ]);
        $step($this->request('RQ-2026-0101', 'pending'), $me->employee_id, 'current', 4);
        $step($this->request('RQ-2026-0102', 'pending'), $me->employee_id, 'current', 1);
        $step($this->request('RQ-2026-0103', 'pending'), $me->employee_id, 'approved', 9);
        $step($this->request('RQ-2026-0104', 'pending'), $someone->employee_id, 'current', 9);

        $this->assertSame(['count' => 2, 'oldest_days' => 4], $this->mine($me)['todo']['approvals']);
    }

    /** No employee record: zeros everywhere — never the orphan rows a `requester_id IS NULL` match would pull in. */
    public function test_an_account_without_an_employee_record_gets_zeros_not_orphan_rows(): void
    {
        $admin = User::factory()->create(['employee_id' => null]);
        Asset::factory()->create(['owner_employee_id' => null, 'status' => 'pending_acceptance']);

        $mine = $this->mine($admin);

        $this->assertSame(0, $mine['kpi']['open_tickets']);
        $this->assertSame(0, $mine['kpi']['assets']);
        $this->assertSame(0, $mine['kpi']['access_total']);
        $this->assertSame([], $mine['tickets']);
        $this->assertSame([], $mine['todo']['pending_acceptance']);
        $this->assertNull($mine['todo']['my_jobs']);
        $this->assertNull($mine['todo']['approvals']);
    }
}
