<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Exports\Report\TabularSectionSheet;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\SlaTarget;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\TicketSla;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * "สรุปผล SLA ของ Ticket จากคำขอ" (tickets.request_sla): tickets the system opened from approved requests,
 * judged per request type. The reader holds hardware and software levels only.
 *
 * September 2026, as of the 25th 10:00 (response target due 2 h after opening):
 *  t1 computer  hw  completed  taken in 30 min (met)   closed after 24 h, before due (met)
 *  t2 computer  hw  completed  taken after 23 h (late) closed after 120 h, past due (late)
 *  t3 computer  hw  open       never taken, response due the 20th — over SLA now
 *  t4 email     sw  canceled   taken in 1 h (met)      — not judged on closing
 *  t5 email     sw  in progress taken in 30 min (met)  resolve due the 30th — still in time
 * Left out: a manual ticket, a network ticket (outside the reader's levels), an August ticket.
 */
class TicketRequestSlaReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;

    private const RANGE = 'from=2026-09-01&to=2026-09-30';

    /** @var array<string, Ticket> */
    private array $set = [];

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
        TicketSla::flush();
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

    private function reader(): User
    {
        return $this->userWith(['tickets.view_all', 'tickets.resolve', 'tickets.level_hardware', 'tickets.level_software']);
    }

    /**
     * A ticket opened from a request of `$type` (or by hand when `$type` is null).
     *
     * @param  array<string, mixed>  $attributes
     */
    private function ticket(?string $type, string $opened, array $attributes): Ticket
    {
        $requester = Employee::create(['first_name' => 'Anan', 'last_name' => 'IT']);
        $ticket = Ticket::factory()->create(array_merge([
            'requester_id' => $requester->id,
            'category' => 'hardware',
            'source' => $type === null ? 'manual' : 'auto_request',
            'created_at' => $opened,
            'sla_response_due_at' => date('Y-m-d H:i:s', strtotime($opened) + 2 * 3600),
        ], $attributes));

        if ($type !== null) {
            $this->seq++;
            ServiceRequest::create([
                'reference' => sprintf('RQ-2026-%04d', $this->seq), 'type' => $type, 'origin' => 'direct',
                'requester_name' => 'Anan', 'title' => "Request {$this->seq}", 'reason' => 'Needed for work.',
                'status' => 'approved', 'ticket_id' => $ticket->id,
            ]);
        }

        return $ticket;
    }

    private function seedTickets(): void
    {
        $kan = User::factory()->create(['name' => 'Kankanok']);
        $som = User::factory()->create(['name' => 'Somsak']);

        $this->set = [
            't1' => $this->ticket('computer', '2026-09-01 10:00:00', ['status' => 'completed', 'assignee_id' => $kan->id,
                'responded_at' => '2026-09-01 10:30:00', 'resolved_at' => '2026-09-02 10:00:00', 'sla_resolve_due_at' => '2026-09-03 10:00:00']),
            't2' => $this->ticket('computer', '2026-09-05 10:00:00', ['status' => 'completed', 'assignee_id' => $som->id,
                'responded_at' => '2026-09-06 09:00:00', 'resolved_at' => '2026-09-10 10:00:00', 'sla_resolve_due_at' => '2026-09-08 10:00:00']),
            't3' => $this->ticket('computer', '2026-09-20 08:00:00', ['status' => 'open', 'sla_response_due_at' => '2026-09-20 10:00:00']),
            't4' => $this->ticket('email', '2026-09-03 10:00:00', ['category' => 'software', 'status' => 'canceled', 'assignee_id' => $kan->id,
                'responded_at' => '2026-09-03 11:00:00', 'resolved_at' => '2026-09-04 10:00:00']),
            't5' => $this->ticket('email', '2026-09-10 10:00:00', ['category' => 'software', 'status' => 'in_progress', 'assignee_id' => $kan->id,
                'responded_at' => '2026-09-10 10:30:00', 'sla_resolve_due_at' => '2026-09-30 10:00:00']),
            'manual' => $this->ticket(null, '2026-09-02 10:00:00', ['status' => 'completed', 'resolved_at' => '2026-09-02 12:00:00']),
            'network' => $this->ticket('cctv', '2026-09-02 10:00:00', ['category' => 'network', 'status' => 'open']),
            'august' => $this->ticket('hardware', '2026-08-20 10:00:00', ['status' => 'completed', 'resolved_at' => '2026-08-21 10:00:00']),
        ];
    }

    public function test_rows_list_only_request_tickets_the_reader_may_count_newest_first(): void
    {
        $this->seedTickets();

        $body = $this->actingAs($this->reader())->getJson('/api/reports/r/tickets.request_sla/rows?'.self::RANGE)->assertOk()->json();

        $ids = array_column($body['data'], 'id');
        $this->assertSame(array_map(fn (string $k) => $this->set[$k]->id, ['t3', 't5', 't2', 't4', 't1']), $ids);

        $rows = collect($body['data'])->keyBy('id');
        $t1 = $rows[$this->set['t1']->id];
        $this->assertSame('RQ-2026-0001', $t1['request_no']);
        $this->assertSame('computer', $t1['request_type']);
        $this->assertSame('2026-09-01 10:30', $t1['taken_at']);
        $this->assertSame('met', $t1['take_sla']);
        $this->assertSame('met', $t1['close_sla']);
        $this->assertEquals(24.0, $t1['fix_hours']);

        $t2 = $rows[$this->set['t2']->id];
        $this->assertSame(['missed', 'missed'], [$t2['take_sla'], $t2['close_sla']]);

        // Never taken and past its response deadline: over SLA on taking; closing has not started
        // (the resolve clock runs from the moment a case is taken), so it is not judged there.
        $t3 = $rows[$this->set['t3']->id];
        $this->assertSame(['over', null], [$t3['take_sla'], $t3['close_sla']]);
        $this->assertNull($t3['taken_at']);

        // Canceled: taken in time, but closing is not judged and has no time to fix.
        $t4 = $rows[$this->set['t4']->id];
        $this->assertSame('met', $t4['take_sla']);
        $this->assertNull($t4['close_sla']);
        $this->assertNull($t4['closed_at']);
        $this->assertNull($t4['fix_hours']);

        // Still in progress and in time: nothing to judge on closing yet.
        $this->assertNull($rows[$this->set['t5']->id]['close_sla']);
    }

    public function test_summary_tiles_judge_closing_on_completed_cases_and_taking_on_taken_ones(): void
    {
        $this->seedTickets();

        $body = $this->actingAs($this->reader())->getJson('/api/reports/r/tickets.request_sla/rows?'.self::RANGE)->assertOk()->json();
        $summary = collect($body['summary'])->keyBy('key');

        $this->assertSame(5, $summary['rs_total']['value']);
        $this->assertSame([2, 1, 2], array_column($summary['rs_total']['split'], 'value'));

        // 1 of 2 completed closed in time; the goal comes from settings (90 by default).
        $this->assertSame(50, $summary['rs_close_rate']['value']);
        $this->assertSame('percent', $summary['rs_close_rate']['format']);
        $this->assertSame(90, $summary['rs_close_rate']['goal']);
        $this->assertSame(['met' => 1, 'n' => 2], $summary['rs_close_rate']['note']['values']);

        // 3 of 4 taken in time — the never-taken t3 is not in it.
        $this->assertSame(75, $summary['rs_take_rate']['value']);
        $this->assertSame(['met' => 3, 'n' => 4], $summary['rs_take_rate']['note']['values']);

        // (24 + 120) / 2, split over the same completed cases: waiting to be taken (0.5 + 23) / 2 — the
        // per-type table's take time too — then the work after it; the two parts add up to the tile.
        $this->assertEquals(72.0, $summary['rs_fix_avg']['value']);
        $this->assertSame('hours', $summary['rs_fix_avg']['format']);
        $this->assertSame(['wait', 'work'], array_column($summary['rs_fix_avg']['split'], 'key'));
        $this->assertEquals([11.8, 60.2], array_column($summary['rs_fix_avg']['split'], 'value'));
        $this->assertNull($summary['rs_fix_avg']['note']);

        // Past SLA right now: t3 (not taken in time) — half of the 2 still open.
        $this->assertSame(1, $summary['rs_over_sla']['value']);
        $this->assertSame(50, $summary['rs_over_sla']['share']);
        $this->assertSame([1, 0], array_column($summary['rs_over_sla']['split'], 'value'));
    }

    public function test_breakdown_lists_every_type_with_its_tally_the_open_tickets_and_the_rules(): void
    {
        $this->seedTickets();
        SlaTarget::create(['scope' => 'request_type', 'match_value' => 'computer', 'resolve_hours' => 24, 'clock' => 'business', 'enabled' => true]);
        TicketSla::flush();

        $data = $this->actingAs($this->reader())
            ->getJson('/api/reports/tickets/request-sla/breakdown?'.self::RANGE)->assertOk()->json('data');

        $this->assertSame(['computer', 'email'], array_column($data['types'], 'type'));
        [$computer, $email] = $data['types'];
        $this->assertSame([3, 2, 0, 1], [$computer['total'], $computer['completed'], $computer['canceled'], $computer['open']]);
        $this->assertSame([1, 2, 1, 2], [$computer['take_met'], $computer['take_total'], $computer['close_met'], $computer['close_total']]);
        $this->assertEquals(11.75, $computer['take_avg_hours']);
        $this->assertEquals(72.0, $computer['fix_avg_hours']);

        $this->assertSame([2, 0, 1, 1], [$email['total'], $email['completed'], $email['canceled'], $email['open']]);
        $this->assertSame([2, 2, 0, 0], [$email['take_met'], $email['take_total'], $email['close_met'], $email['close_total']]);
        $this->assertNull($email['fix_avg_hours']);

        $this->assertSame(5, $data['overall']['total']);
        $this->assertContains('hardware', $data['empty_types']);
        $this->assertNotContains('computer', $data['empty_types']);

        $this->assertSame([$this->set['t3']->id], array_column($data['open'], 'id'));
        $this->assertSame('response', $data['open'][0]['due_kind']);
        $this->assertSame('2026-09-20 10:00', $data['open'][0]['due_at']);
        $this->assertEquals(120.0, $data['open'][0]['over_hours']);

        $this->assertSame(90, $data['rules']['goal']);
        $this->assertSame(120, $data['rules']['response_minutes']);
        $resolve = collect($data['rules']['resolve'])->keyBy('type');
        $this->assertSame(['type' => 'computer', 'hours' => 24, 'clock' => 'business'], $resolve['computer']);
        $this->assertNull($resolve['email']['hours']);
    }

    public function test_a_taken_case_past_its_resolve_deadline_is_over_on_closing_and_counts_once(): void
    {
        $this->seedTickets();
        // Taken in time, then left past its resolve deadline.
        $late = $this->ticket('computer', '2026-09-15 10:00:00', ['status' => 'in_progress',
            'responded_at' => '2026-09-15 10:30:00', 'sla_resolve_due_at' => '2026-09-18 10:00:00']);
        $user = $this->reader();

        $body = $this->actingAs($user)->getJson('/api/reports/r/tickets.request_sla/rows?'.self::RANGE)->assertOk()->json();
        $row = collect($body['data'])->firstWhere('id', $late->id);
        $this->assertSame(['met', 'over'], [$row['take_sla'], $row['close_sla']]);
        $over = collect($body['summary'])->firstWhere('key', 'rs_over_sla');
        $this->assertSame(2, $over['value']);
        // One not taken yet (t3), one taken but not closed in time.
        $this->assertSame([1, 1], array_column($over['split'], 'value'));

        $open = $this->actingAs($user)->getJson('/api/reports/tickets/request-sla/breakdown?'.self::RANGE)->assertOk()->json('data.open');
        // Most overdue first: t3 missed its taking deadline on the 20th 10:00, this one its resolve deadline on the 18th.
        $this->assertSame([$late->id, $this->set['t3']->id], array_column($open, 'id'));
        $this->assertSame('resolve', $open[0]['due_kind']);
    }

    public function test_request_type_and_assignee_filters_narrow_the_rows_but_not_the_type_table(): void
    {
        $this->seedTickets();
        $user = $this->reader();

        $rows = $this->actingAs($user)->getJson('/api/reports/r/tickets.request_sla/rows?'.self::RANGE.'&request_type=email')->assertOk()->json('data');
        $this->assertSame([$this->set['t5']->id, $this->set['t4']->id], array_column($rows, 'id'));

        $types = $this->actingAs($user)->getJson('/api/reports/tickets/request-sla/breakdown?'.self::RANGE.'&request_type=email')->assertOk()->json('data.types');
        $this->assertSame(['computer', 'email'], array_column($types, 'type'));

        $somsak = $this->set['t2']->assignee_id;
        $rows = $this->actingAs($user)->getJson('/api/reports/r/tickets.request_sla/rows?'.self::RANGE."&assignee={$somsak}")->assertOk()->json('data');
        $this->assertSame([$this->set['t2']->id], array_column($rows, 'id'));
    }

    public function test_it_needs_the_same_permissions_as_the_other_ticket_reports(): void
    {
        $this->seedTickets();
        $viewer = $this->userWith(['tickets.view_all', 'tickets.level_hardware']);

        $this->actingAs($viewer)->getJson('/api/reports/r/tickets.request_sla/rows')->assertForbidden();
        $this->actingAs($viewer)->getJson('/api/reports/tickets/request-sla/breakdown')->assertForbidden();

        $keys = array_column($this->actingAs($this->reader())->getJson('/api/reports')->assertOk()->json('data'), 'key');
        $this->assertContains('tickets.request_sla', $keys);
    }

    public function test_excel_export_carries_the_per_type_sheet_between_summary_and_rows(): void
    {
        Excel::fake();
        $this->seedTickets();

        $this->actingAs($this->reader())
            ->exportReport('/api/reports/r/tickets.request_sla/export?format=xlsx&'.self::RANGE)->assertAccepted();

        $this->assertExportStored('Report_tickets-request_sla_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheets = $export->sheets();
            $this->assertCount(3, $sheets);
            $this->assertSame('สรุปผล SLA ของ Ticket จากคำขอ', $sheets[0]->array()[0][0]);
            $this->assertInstanceOf(TabularSectionSheet::class, $sheets[1]);
            $this->assertSame('ตามประเภทคำขอ', $sheets[1]->title());

            $lines = $sheets[1]->array();
            $this->assertSame(['คอมพิวเตอร์', 3, 2, 0, 1, '1/2', 50, '1/2', 50, 11.75, 72.0], $lines[0]);
            $this->assertSame('รวม', end($lines)[0]);

            $row = $sheets[2]->map($export->rows->first());

            return in_array('เกิน SLA', $row, true);
        });
    }

    /** The rows tab is the raw data: every field, grouped — the case, who, when, then each SLA. */
    public function test_excel_rows_tab_is_raw_data_grouped_for_analysis(): void
    {
        Excel::fake();
        $this->seedTickets();
        $user = $this->reader();

        // The page and its rows keep to their own columns.
        $screen = array_column($this->actingAs($user)->getJson('/api/reports/r/tickets.request_sla')->assertOk()->json('data.columns'), 'key');
        $this->assertNotContains('description', $screen);
        $this->assertNotContains('take_hours', $screen);

        $this->actingAs($user)->exportReport('/api/reports/r/tickets.request_sla/export?format=xlsx&'.self::RANGE)->assertAccepted();

        $this->assertExportStored('Report_tickets-request_sla_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheet = last($export->sheets());
            $this->assertSame('ข้อมูลดิบ', $sheet->title());
            $headings = $sheet->headings();
            $this->assertSame([
                'เลขที่ Ticket', 'เลขที่คำขอ', 'ประเภทคำขอ', 'เรื่อง', 'รายละเอียด', 'หมวด', 'ลักษณะงาน', 'ความสำคัญ',
                'ผู้แจ้ง', 'แผนก', 'ผู้รับผิดชอบ',
                'สถานะ', 'วันที่แจ้ง', 'เดือนที่แจ้ง', 'รับเคสเมื่อ', 'ปิดเคสเมื่อ', 'ยกเลิกเมื่อ',
                'วันที่ครบกำหนด SLA รับเคส', 'รับเคสทัน SLA', 'เวลารอรับเคส (ชม.)',
                'วันที่ครบกำหนด SLA ปิดเคส', 'ปิดทัน SLA', 'เวลาแก้ไข (ชม.)',
            ], $headings);

            $rows = $export->rows->map(fn (Ticket $t) => array_combine($headings, $sheet->map($t)))->keyBy('เลขที่ Ticket');
            // t2: opened the 5th 10:00, taken the 6th 09:00 (23 h), closed the 10th after a resolve due of the 8th.
            $t2 = $rows[$this->set['t2']->ticket_no];
            $this->assertSame('2026-09', $t2['เดือนที่แจ้ง']);
            $this->assertEquals(23.0, $t2['เวลารอรับเคส (ชม.)']);
            $this->assertSame('2026-09-08 10:00', $t2['วันที่ครบกำหนด SLA ปิดเคส']);
            $this->assertSame('ไม่ทัน', $t2['ปิดทัน SLA']);
            $this->assertSame('งานปกติ', $t2['ลักษณะงาน']);
            $this->assertSame(trim($this->set['t2']->description), $t2['รายละเอียด']);
            // t4 was canceled the 4th: it has a cancel time and no close time.
            $t4 = $rows[$this->set['t4']->ticket_no];
            $this->assertSame('2026-09-04 10:00', $t4['ยกเลิกเมื่อ']);
            $this->assertNull($t4['ปิดเคสเมื่อ']);

            return true;
        });
    }

    public function test_pdf_export_streams_a_pdf(): void
    {
        $this->seedTickets();

        $response = $this->actingAs($this->reader())->exportReport('/api/reports/r/tickets.request_sla/export?format=pdf&'.self::RANGE);

        $response->assertOk();
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
    }
}
