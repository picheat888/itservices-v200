<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\TestCase;

/**
 * The three request tabular reports — "สรุปคำขอตามประเภทและสถานะ" (requests.summary),
 * "ระยะเวลาอนุมัติแต่ละขั้น" (requests.approval_time) and "คำขอที่รอดำเนินการโดย IT"
 * (requests.it_pending) — through the generic /reports/r/{key} endpoints.
 */
class RequestReportsTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @param array<string, mixed> $extra */
    private function request(string $type, string $status, array $extra = []): ServiceRequest
    {
        $this->seq++;

        return ServiceRequest::create(array_merge([
            'reference' => sprintf('RQ-2026-%04d', $this->seq), 'type' => $type, 'origin' => 'direct',
            'requester_name' => 'Somchai', 'title' => "Request {$this->seq}", 'reason' => 'Needed for work.',
            'status' => $status,
        ], $extra));
    }

    /** @param array<string, mixed> $attributes */
    private function step(ServiceRequest $request, string $approver, string $status, string $becameCurrent, ?string $actedAt = null, array $attributes = []): RequestApproval
    {
        return RequestApproval::create(array_merge([
            'service_request_id' => $request->id, 'position' => 1, 'actor_type' => 'chain', 'kind' => 'approval',
            'label' => 'Manager', 'approver_name' => $approver, 'status' => $status,
            'became_current_at' => $becameCurrent, 'acted_at' => $actedAt,
        ], $attributes));
    }

    // ── requests.summary ────────────────────────────────────────────────────────────

    public function test_summary_counts_each_type_by_status_busiest_first(): void
    {
        $this->request('computer', 'pending');
        $this->request('computer', 'completed');
        $this->request('computer', 'approved');
        $this->request('computer', 'rejected');
        $this->request('email', 'cancelled');
        $old = $this->request('email', 'completed');
        ServiceRequest::query()->whereKey($old->id)->update(['created_at' => '2025-12-31 09:00:00']);

        $body = $this->actingAs($this->userWith(['requests.view_all']))
            ->getJson('/api/reports/r/requests.summary/rows')->assertOk()->json();

        $this->assertSame(['computer', 'email'], array_column($body['data'], 'request_type'));
        $computer = $body['data'][0];
        $this->assertEquals(4, $computer['total_count']);
        $this->assertEquals(1, $computer['pending_count']);
        $this->assertEquals(1, $computer['approved_count']);
        $this->assertEquals(1, $computer['completed_count']);
        $this->assertEquals(1, $computer['rejected_count']);
        // (1 approved + 1 completed) of 3 decided.
        $this->assertEquals(67, $computer['approval_rate']);
        $this->assertNull($body['data'][1]['approval_rate']);
        $this->assertSame(2, $body['meta']['total']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(5, $summary['total']['value']);
        $this->assertSame(1, $summary['pending']['value']);
        $this->assertSame(1, $summary['rejected']['value']);
    }

    public function test_summary_filters_by_the_requesters_department(): void
    {
        $it = Department::create(['name' => 'IT']);
        $employee = Employee::create(['code' => 'EMP-1', 'first_name' => 'Somchai', 'last_name' => 'D', 'department_id' => $it->id]);
        $this->request('mobile', 'pending', ['employee_id' => $employee->id]);
        $this->request('computer', 'pending');

        $types = array_column($this->actingAs($this->userWith(['requests.view_all']))
            ->getJson('/api/reports/r/requests.summary/rows?department_id='.$it->id)->assertOk()->json('data'), 'request_type');

        $this->assertSame(['mobile'], $types);
    }

    // ── requests.approval_time ──────────────────────────────────────────────────────

    public function test_approval_time_ranks_approvers_by_average_wait(): void
    {
        $this->step($this->request('computer', 'completed'), 'Manee', 'approved', '2026-09-20 10:00:00', '2026-09-22 10:00:00');
        $this->step($this->request('computer', 'pending'), 'Manee', 'current', '2026-09-24 10:00:00');
        $this->step($this->request('email', 'rejected'), 'Somsak', 'rejected', '2026-09-10 10:00:00', '2026-09-20 10:00:00');
        // Left out: a waiting step on a cancelled request, IT's completion step, last month.
        $this->step($this->request('computer', 'cancelled'), 'Ghost', 'current', '2026-09-02 10:00:00');
        $this->step($this->request('computer', 'approved'), 'IT desk', 'current', '2026-09-03 10:00:00', null, ['kind' => 'completion', 'actor_type' => 'it_staff']);
        $this->step($this->request('computer', 'completed'), 'Old', 'approved', '2026-08-01 10:00:00', '2026-08-30 10:00:00');

        $body = $this->actingAs($this->userWith(['requests.view_all']))
            ->getJson('/api/reports/r/requests.approval_time/rows')->assertOk()->json();

        $this->assertSame(['Somsak', 'Manee'], array_column($body['data'], 'approver'));
        [$somsak, $manee] = $body['data'];
        $this->assertEqualsWithDelta(10.0, $somsak['avg_days'], 0.01);
        $this->assertNull($somsak['oldest_waiting_days']);
        $this->assertEquals(2, $manee['steps']);
        $this->assertEquals(1, $manee['waiting_now']);
        $this->assertEqualsWithDelta(1.5, $manee['avg_days'], 0.01);
        $this->assertEqualsWithDelta(2.0, $manee['max_days'], 0.01);
        $this->assertEqualsWithDelta(1.0, $manee['oldest_waiting_days'], 0.01);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(2, $summary['total']['value']);
        $this->assertSame(3, $summary['steps']['value']);
        $this->assertSame(1, $summary['waiting_now']['value']);
        // Weighted by steps: (36h × 2 + 240h) / 3 = 104h.
        $this->assertEqualsWithDelta(4.3, $summary['avg_days']['value'], 0.01);
    }

    public function test_approval_time_names_whoever_decided_and_filters_by_type(): void
    {
        $this->step($this->request('mobile', 'completed'), 'Manee', 'approved', '2026-09-20 10:00:00', '2026-09-21 10:00:00', ['acted_by_name' => 'Deputy']);
        $this->step($this->request('email', 'completed'), 'Somsak', 'approved', '2026-09-20 10:00:00', '2026-09-21 10:00:00');

        $approvers = array_column($this->actingAs($this->userWith(['requests.view_all']))
            ->getJson('/api/reports/r/requests.approval_time/rows?type=mobile')->assertOk()->json('data'), 'approver');

        $this->assertSame(['Deputy'], $approvers);
    }

    // ── requests.it_pending ─────────────────────────────────────────────────────────

    public function test_it_pending_lists_approved_requests_longest_wait_first(): void
    {
        $assignee = User::factory()->create(['name' => 'Kankanok']);
        $ticket = Ticket::factory()->create(['status' => 'in_progress', 'assignee_id' => $assignee->id]);
        $recent = $this->request('computer', 'approved', ['approved_at' => '2026-09-23 09:00:00']);
        $oldest = $this->request('mobile', 'approved', ['approved_at' => '2026-09-10 09:00:00', 'ticket_id' => $ticket->id]);
        $this->request('email', 'pending');
        $this->request('email', 'completed', ['approved_at' => '2026-09-01 09:00:00']);

        $body = $this->actingAs($this->userWith(['requests.view_all']))
            ->getJson('/api/reports/r/requests.it_pending/rows')->assertOk()->json();

        $this->assertSame([$oldest->id, $recent->id], array_column($body['data'], 'id'));
        $row = $body['data'][0];
        $this->assertSame($oldest->reference, $row['request_no']);
        $this->assertEquals(15, $row['waiting_days']);
        $this->assertSame($ticket->ticket_no, $row['ticket_no']);
        $this->assertSame('in_progress', $row['ticket_status']);
        $this->assertSame('Kankanok', $row['assignee']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(2, $summary['total']['value']);
        $this->assertSame(1, $summary['over_3_days']['value']);
        $this->assertSame(1, $summary['over_7_days']['value']);
        $this->assertSame(1, $summary['no_ticket']['value']);
    }

    public function test_request_reports_need_view_all(): void
    {
        $submitter = $this->userWith(['requests.submit', 'requests.complete']);

        foreach (['requests.summary', 'requests.approval_time', 'requests.it_pending'] as $key) {
            $this->actingAs($submitter)->getJson("/api/reports/r/{$key}/rows")->assertForbidden();
        }
    }

    // ── exports ─────────────────────────────────────────────────────────────────────

    public function test_grouped_pdf_counts_its_rows_not_its_headline_total(): void
    {
        $this->request('computer', 'pending');
        $this->request('computer', 'pending');

        $response = $this->actingAs($this->userWith(['requests.view_all']))
            ->get('/api/reports/r/requests.summary/export?format=pdf');

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
    }

    public function test_xlsx_export_carries_thai_type_labels(): void
    {
        Excel::fake();
        $this->request('computer', 'pending');

        $this->actingAs($this->userWith(['requests.view_all']))
            ->get('/api/reports/r/requests.summary/export?format=xlsx')->assertOk();

        Excel::assertDownloaded('Report_requests-summary_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheet = $export->sheets()[1];

            return in_array('ประเภทคำขอ', $sheet->headings(), true)
                && in_array('คอมพิวเตอร์', $sheet->map($export->rows->first()), true);
        });
    }
}
