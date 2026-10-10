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
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * "คำขอที่รอ IT ส่งมอบ" (requests.it_pending): the list, the tiles, and the breakdown endpoint
 * (age groups with owners, the 30-day flow, by assignee, by type, new joiners against their start day).
 */
class ItPendingRequestReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions = ['requests.view_all']): User
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

    /**
     * An approved request waiting since $approvedAt, with a ticket held by $assignee (null = nobody) unless $ticket is false.
     *
     * @param  array<string, mixed>  $extra
     */
    private function waiting(string $approvedAt, string $type = 'computer', ?User $assignee = null, bool $ticket = true, array $extra = []): ServiceRequest
    {
        $ticketId = $ticket
            ? Ticket::factory()->create(['status' => $assignee ? 'in_progress' : 'open', 'assignee_id' => $assignee?->id])->id
            : null;

        return $this->request($type, 'approved', ['approved_at' => $approvedAt, 'ticket_id' => $ticketId] + $extra);
    }

    /** @return array<string, mixed> */
    private function breakdown(string $query = ''): array
    {
        return $this->actingAs($this->userWith())->getJson('/api/reports/requests/it-pending/breakdown'.$query)->assertOk()->json('data');
    }

    /** @return array<string, mixed> */
    private function rows(string $query = ''): array
    {
        return $this->actingAs($this->userWith())->getJson('/api/reports/r/requests.it_pending/rows'.$query)->assertOk()->json();
    }

    /** @param array<string, mixed> $extra */
    private function employee(string $code, ?Department $department = null, array $extra = []): Employee
    {
        return Employee::create(array_merge(['code' => $code, 'first_name' => $code, 'last_name' => 'Test', 'status' => 'active', 'department_id' => $department?->id], $extra));
    }

    public function test_lists_only_approved_requests_longest_wait_first_with_ticket_and_holder(): void
    {
        $it = Department::create(['name' => 'Information Technology', 'name_th' => 'ฝ่ายไอที']);
        $joiner = $this->employee('EMP-7', $it);
        $kan = User::factory()->create(['name' => 'Kankanok']);
        $recent = $this->waiting('2026-09-23 09:00:00', 'email', ticket: false);
        $oldest = $this->waiting('2026-09-10 09:00:00', 'mobile', $kan, extra: ['origin' => 'onboarding', 'employee_id' => $joiner->id]);
        $this->request('email', 'pending');
        $this->request('email', 'completed', ['approved_at' => '2026-09-01 09:00:00', 'completed_at' => '2026-09-02 09:00:00']);

        $body = $this->rows();

        $this->assertSame([$oldest->id, $recent->id], array_column($body['data'], 'id'));
        $row = $body['data'][0];
        $this->assertSame($oldest->reference, $row['request_no']);
        $this->assertSame('mobile', $row['request_type']);
        $this->assertSame('onboarding', $row['origin']);
        $this->assertSame('EMP-7', $row['requester_code']);
        $this->assertSame(['name' => 'Information Technology', 'name_th' => 'ฝ่ายไอที'], $row['department']);
        $this->assertEquals(15, $row['waiting_days']);
        $this->assertSame($oldest->ticket->ticket_no, $row['ticket_no']);
        $this->assertSame('in_progress', $row['ticket_status']);
        $this->assertSame('Kankanok', $row['assignee']);
        $this->assertArrayNotHasKey('age_band', $row);
        $this->assertNull($body['data'][1]['ticket_no']);
    }

    public function test_ages_are_whole_days_and_the_tiles_agree_with_the_groups(): void
    {
        // Approved late in the evening still counts by its date: 3 days ago is 3, not "over 3".
        $this->waiting('2026-09-22 23:50:00');
        $this->waiting('2026-09-21 08:00:00');
        $this->waiting('2026-09-18 08:00:00');
        $this->waiting('2026-09-17 08:00:00', ticket: false);
        $this->waiting('2026-09-25 09:00:00');

        $body = $this->rows();
        $this->assertSame([8, 7, 4, 3, 0], array_column($body['data'], 'waiting_days'));

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(5, $summary['rqi_waiting']['value']);
        $this->assertSame(['over_7' => 1, 'days_4_7' => 2, 'upto_3' => 2], collect($summary['rqi_waiting']['split'])->pluck('value', 'key')->all());
        // เกิน 3 วัน = 4–7 + เกิน 7.
        $this->assertSame(3, $summary['rqi_over_3']['value']);
        $this->assertSame(60, $summary['rqi_over_3']['share']);
        $this->assertSame(['pct' => 60], $summary['rqi_over_3']['note']['values']);
        $this->assertSame(1, $summary['rqi_over_7']['value']);
        $this->assertSame(['days' => 8], $summary['rqi_over_7']['note']['values']);
        $this->assertSame('RQ-2026-0004', $summary['rqi_over_7']['note']['texts']['reference']);
        $this->assertSame(1, $summary['rqi_no_ticket']['value']);
        $this->assertSame(['n' => 4], $summary['rqi_no_ticket']['note']['values']);
    }

    public function test_filters_by_type_department_assignee_and_search(): void
    {
        $qc = Department::create(['name' => 'Quality Control']);
        $person = $this->employee('EMP-1', $qc);
        $kan = User::factory()->create(['name' => 'Kankanok']);
        $held = $this->waiting('2026-09-20 09:00:00', 'computer', $kan, extra: ['employee_id' => $person->id, 'requester_name' => 'Siriporn']);
        $nobody = $this->waiting('2026-09-21 09:00:00', 'email');
        $noTicket = $this->waiting('2026-09-22 09:00:00', 'email', ticket: false);

        $ids = fn (string $q) => array_column($this->rows($q)['data'], 'id');

        $this->assertSame([$nobody->id, $noTicket->id], $ids('?type=email'));
        $this->assertSame([$held->id], $ids('?department_id='.$qc->id));
        $this->assertSame([$held->id], $ids('?assignee='.$kan->id));
        $this->assertSame([$nobody->id], $ids('?assignee=none'));
        $this->assertSame([$noTicket->id], $ids('?assignee=no_ticket'));
        $this->assertSame([$held->id], $ids('?search=Siri'));
        $this->assertSame(1, $this->breakdown('?type=email&assignee=none')['waiting']['total']);
    }

    public function test_breakdown_groups_by_age_with_owners_and_by_assignee_and_type(): void
    {
        $kan = User::factory()->create(['name' => 'Kankanok']);
        $the = User::factory()->create(['name' => 'Theerawat']);
        $this->waiting('2026-09-01 09:00:00', 'computer', $kan);
        $this->waiting('2026-09-20 09:00:00', 'computer', $kan);
        $this->waiting('2026-09-24 09:00:00', 'email', $the);
        $this->waiting('2026-09-10 09:00:00', 'telephone');
        $this->waiting('2026-09-24 09:00:00', 'email', ticket: false);

        $b = $this->breakdown();

        $this->assertSame(5, $b['waiting']['total']);
        // (24 + 5 + 1 + 15 + 1) / 5
        $this->assertEquals(9.2, $b['waiting']['avg_days']);
        $this->assertSame(['total' => 2, 'unassigned' => 1, 'no_ticket' => 0, 'assigned' => 1], $b['waiting']['bands']['over_7']);
        $this->assertSame(['total' => 1, 'unassigned' => 0, 'no_ticket' => 0, 'assigned' => 1], $b['waiting']['bands']['days_4_7']);
        $this->assertSame(['total' => 2, 'unassigned' => 0, 'no_ticket' => 1, 'assigned' => 1], $b['waiting']['bands']['upto_3']);

        $owners = $b['by_assignee'];
        $this->assertSame([(string) $kan->id, (string) $the->id, 'none', 'no_ticket'], array_column($owners, 'key'));
        $this->assertSame('Kankanok', $owners[0]['name']);
        $this->assertSame(2, $owners[0]['total']);
        $this->assertSame(2, $owners[0]['in_progress']);
        $this->assertSame(24, $owners[0]['oldest_days']);
        $this->assertSame(['over_7' => 1, 'days_4_7' => 1, 'upto_3' => 0], $owners[0]['bands']);
        $this->assertSame(1, $owners[2]['open']);

        $this->assertSame(['computer', 'email', 'telephone'], array_column($b['by_type'], 'type'));
        $this->assertSame(24, $b['by_type'][0]['oldest_days']);
    }

    public function test_the_flow_row_counts_requests_finished_in_the_last_30_days(): void
    {
        $this->request('computer', 'completed', ['approved_at' => '2026-09-01 16:00:00', 'completed_at' => '2026-09-10 09:00:00']);
        $this->request('email', 'completed', ['approved_at' => '2026-09-20 16:00:00', 'completed_at' => '2026-09-24 08:00:00']);
        $this->request('email', 'completed', ['approved_at' => '2026-09-24 16:00:00', 'completed_at' => '2026-09-25 08:00:00']);
        // The first of the 30 days (today included) is 27 Aug.
        $this->request('computer', 'completed', ['approved_at' => '2026-08-20 16:00:00', 'completed_at' => '2026-08-27 00:30:00']);
        // Left out: finished the day before the 30 days, cancelled after approval.
        $this->request('email', 'completed', ['approved_at' => '2026-08-20 16:00:00', 'completed_at' => '2026-08-26 23:59:00']);
        $this->request('email', 'cancelled', ['approved_at' => '2026-09-20 16:00:00', 'cancelled_at' => '2026-09-21 08:00:00']);

        $flow = $this->breakdown()['delivered'];

        $this->assertSame(['from' => '2026-08-27', 'to' => '2026-09-25'], ['from' => $flow['from'], 'to' => $flow['to']]);
        $this->assertSame(4, $flow['total']);
        $this->assertSame(['over_7' => 1, 'days_4_7' => 2, 'upto_3' => 1], $flow['bands']);
        // (9 + 4 + 1 + 7) / 4
        $this->assertEquals(5.3, $flow['avg_days']);
        $this->assertSame(2, $this->breakdown('?type=email')['delivered']['total']);
    }

    public function test_new_joiners_are_ready_late_or_not_ready_against_their_start_day(): void
    {
        $prod = Department::create(['name' => 'Production', 'name_th' => 'ฝ่ายผลิต']);
        $safety = Department::create(['name' => 'Safety']);
        $kan = User::factory()->create(['name' => 'Kankanok']);
        $onboard = fn (Employee $e, string $type, string $status, array $extra = []) => $this->request($type, $status, ['origin' => 'onboarding', 'employee_id' => $e->id] + $extra);

        $ready = $this->employee('NJ1', $prod, ['joined_at' => '2026-09-10']);
        $onboard($ready, 'computer', 'completed', ['completed_at' => '2026-09-09 16:00:00']);
        $onboard($ready, 'email', 'completed', ['completed_at' => '2026-09-10 08:00:00']);

        $late = $this->employee('NJ2', $prod, ['joined_at' => '2026-09-15']);
        $onboard($late, 'computer', 'completed', ['completed_at' => '2026-09-14 16:00:00']);
        $onboard($late, 'email', 'completed', ['completed_at' => '2026-09-17 09:00:00']);

        $started = $this->employee('NJ3', $prod, ['joined_at' => '2026-09-22']);
        $ticket = Ticket::factory()->create(['status' => 'in_progress', 'assignee_id' => $kan->id]);
        $onboard($started, 'email', 'approved', ['approved_at' => '2026-09-18 09:00:00', 'ticket_id' => $ticket->id]);

        $coming = $this->employee('NJ4', $safety, ['joined_at' => '2026-10-05']);
        $pending = $onboard($coming, 'mobile', 'pending');
        RequestApproval::create([
            'service_request_id' => $pending->id, 'position' => 1, 'actor_type' => 'chain', 'kind' => 'approval',
            'label' => 'Manager', 'approver_name' => 'Anan', 'status' => 'current', 'became_current_at' => '2026-09-24 09:00:00',
        ]);

        $gone = $this->employee('NJ5', $prod, ['joined_at' => '2026-09-28', 'status' => 'resigned', 'last_day' => '2026-09-24']);
        $onboard($gone, 'computer', 'pending');
        // Left out: resigned with nothing open, every request rejected, starting outside the 30-day window.
        $closed = $this->employee('NJ6', $prod, ['joined_at' => '2026-09-20', 'status' => 'resigned', 'last_day' => '2026-09-19']);
        $onboard($closed, 'computer', 'cancelled');
        $rejected = $this->employee('NJ7', $prod, ['joined_at' => '2026-09-20']);
        $onboard($rejected, 'computer', 'rejected');
        $far = $this->employee('NJ8', $prod, ['joined_at' => '2026-11-30']);
        $onboard($far, 'computer', 'pending');

        $j = $this->breakdown()['joiners'];

        $this->assertSame(['from' => '2026-08-26', 'to' => '2026-10-25'], ['from' => $j['from'], 'to' => $j['to']]);
        $this->assertSame(['on_time' => 1, 'late' => 1, 'open' => 2, 'past_start' => 1, 'before_start' => 1], $j['counts']);
        $this->assertSame(['computer', 'mobile', 'email'], $j['types']);
        // Not ready past the start day, not ready before it, ready late, ready on time.
        $this->assertSame(['NJ3', 'NJ4', 'NJ2', 'NJ1'], array_column($j['rows'], 'code'));
        [$nj3, $nj4, $nj2] = $j['rows'];
        $this->assertTrue($nj3['started']);
        $this->assertSame(-3, $nj3['days_to_start']);
        $this->assertSame('Kankanok', $nj3['requests'][0]['assignee']);
        $this->assertSame(10, $nj4['days_to_start']);
        $this->assertSame(1, $nj4['pending']);
        $this->assertSame('Anan', $nj4['requests'][0]['current_approver']);
        $this->assertSame('late', $nj2['verdict']);
        $this->assertSame(2, $nj2['late_days']);
        $this->assertSame(2, $nj2['requests'][1]['late_days']);
        $this->assertSame(['NJ5'], array_column($j['left_early'], 'code'));
        $this->assertSame('2026-09-24', $j['left_early'][0]['last_day']);

        $tile = collect($this->rows()['summary'])->keyBy('key')['rqi_joiners'];
        $this->assertSame(2, $tile['value']);
        $this->assertSame('red', $tile['attention']);
        $this->assertSame(['n' => 1], $tile['note']['values']);

        $this->assertSame(['NJ4'], array_column($this->breakdown('?department_id='.$safety->id)['joiners']['rows'], 'code'));
    }

    public function test_the_joiners_tile_is_amber_while_nobody_has_passed_their_start_day(): void
    {
        $coming = $this->employee('NJ1', null, ['joined_at' => '2026-10-01']);
        $this->request('computer', 'pending', ['origin' => 'onboarding', 'employee_id' => $coming->id]);

        $tile = collect($this->rows()['summary'])->keyBy('key')['rqi_joiners'];

        $this->assertSame(1, $tile['value']);
        $this->assertSame('amber', $tile['attention']);
        $this->assertSame(['n' => 0], $tile['note']['values']);
    }

    public function test_an_empty_queue_still_answers_every_card(): void
    {
        $b = $this->breakdown();

        $this->assertSame(0, $b['waiting']['total']);
        $this->assertNull($b['waiting']['avg_days']);
        $this->assertSame(['none', 'no_ticket'], array_column($b['by_assignee'], 'key'));
        $this->assertSame([0, 0], array_column($b['by_assignee'], 'total'));
        $this->assertSame([], $b['by_type']);
        $this->assertSame(0, $b['delivered']['total']);
        $this->assertSame([], $b['joiners']['rows']);

        $summary = collect($this->rows()['summary'])->keyBy('key');
        $this->assertNull($summary['rqi_over_3']['note']);
        $this->assertNull($summary['rqi_over_7']['note']);
        $this->assertSame('rep_n_rqi_window', $summary['rqi_joiners']['note']['label_key']);
        $this->assertNull($summary['rqi_joiners']['attention']);
    }

    public function test_needs_view_all(): void
    {
        $submitter = $this->userWith(['requests.submit', 'requests.complete']);

        $this->actingAs($submitter)->getJson('/api/reports/r/requests.it_pending/rows')->assertForbidden();
        $this->actingAs($submitter)->getJson('/api/reports/requests/it-pending/breakdown')->assertForbidden();
    }

    public function test_xlsx_carries_the_cards_as_sheets(): void
    {
        Excel::fake();
        $this->waiting('2026-09-10 09:00:00');

        $this->actingAs($this->userWith())->exportReport('/api/reports/r/requests.it_pending/export?format=xlsx')->assertAccepted();

        $this->assertExportStored('Report_requests-it_pending_2026-09-25.xlsx', function (TabularReportExport $export) {
            $titles = array_map(fn ($sheet) => $sheet->title(), $export->sheets());

            return in_array('ตามระยะเวลารอ', $titles, true) && in_array('ตามผู้รับผิดชอบ', $titles, true)
                && in_array('ตามประเภทคำขอ', $titles, true) && in_array('พนักงานใหม่', $titles, true);
        });
    }
}
