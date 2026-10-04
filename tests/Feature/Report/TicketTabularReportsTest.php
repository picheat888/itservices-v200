<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * The ticket tabular report "Ticket ค้าง และเกิน SLA" (tickets.backlog) over one set of
 * tickets. (Its former siblings, by department and staff performance, are now cards on the
 * Ticket & SLA overview — see TicketOverviewReportTest.) The reader holds hardware and software
 * levels only, so the network ticket in the set must never be counted.
 */
class TicketTabularReportsTest extends TestCase
{
    use ExportsReports, RefreshDatabase;

    /** @var array<string, mixed> */
    private array $set = [];

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

    private function reader(): User
    {
        return $this->userWith(['tickets.view_all', 'tickets.resolve', 'tickets.level_hardware', 'tickets.level_software']);
    }

    /** @param array<string, mixed> $attributes */
    private function ticket(Employee $requester, array $attributes): Ticket
    {
        return Ticket::factory()->create(array_merge(['requester_id' => $requester->id, 'category' => 'hardware'], $attributes));
    }

    /**
     * September, as of the 25th 10:00:
     *  t1 hw  IT     kan  completed 5th→6th (24h)    met
     *  t7 hw  IT     kan  completed 1st→3rd (48h)    met
     *  t8 hw  IT     kan  canceled 8th
     *  t2 sw  IT     kan  in progress, resolve due 20th (breached)
     *  t3 hw  Sales  som  completed 12th→20th (192h) breached
     *  t5 hw  —      —    open, response due 26th (on track)
     *  t4 nw  IT     som  in progress — outside the reader's levels
     *  t6 hw  IT     old  completed in August — outside the range
     */
    private function seedTickets(): void
    {
        $it = Department::create(['name' => 'IT', 'name_th' => 'ไอที']);
        $sales = Department::create(['name' => 'Sales', 'name_th' => 'ฝ่ายขาย']);
        $a = Employee::create(['code' => 'EMP-A', 'first_name' => 'Anan', 'last_name' => 'IT', 'department_id' => $it->id]);
        $b = Employee::create(['code' => 'EMP-B', 'first_name' => 'Bua', 'last_name' => 'Sales', 'department_id' => $sales->id]);
        $c = Employee::create(['code' => 'EMP-C', 'first_name' => 'Chai', 'last_name' => 'None']);
        $kan = User::factory()->create(['name' => 'Kankanok']);
        $som = User::factory()->create(['name' => 'Somsak']);
        $old = User::factory()->create(['name' => 'Old timer']);

        $this->set = [
            'it' => $it, 'sales' => $sales, 'kan' => $kan, 'som' => $som, 'old' => $old,
            't1' => $this->ticket($a, ['status' => 'completed', 'assignee_id' => $kan->id, 'created_at' => '2026-09-05 10:00:00', 'resolved_at' => '2026-09-06 10:00:00', 'sla_resolve_due_at' => '2026-09-07 10:00:00']),
            't7' => $this->ticket($a, ['status' => 'completed', 'assignee_id' => $kan->id, 'created_at' => '2026-09-01 10:00:00', 'resolved_at' => '2026-09-03 10:00:00', 'sla_resolve_due_at' => '2026-09-04 10:00:00']),
            't8' => $this->ticket($a, ['status' => 'canceled', 'assignee_id' => $kan->id, 'created_at' => '2026-09-07 10:00:00', 'resolved_at' => '2026-09-08 10:00:00']),
            't2' => $this->ticket($a, ['category' => 'software', 'status' => 'in_progress', 'assignee_id' => $kan->id, 'created_at' => '2026-09-10 10:00:00', 'responded_at' => '2026-09-10 11:00:00', 'sla_resolve_due_at' => '2026-09-20 10:00:00']),
            't3' => $this->ticket($b, ['status' => 'completed', 'assignee_id' => $som->id, 'created_at' => '2026-09-12 10:00:00', 'resolved_at' => '2026-09-20 10:00:00', 'sla_resolve_due_at' => '2026-09-15 10:00:00']),
            't5' => $this->ticket($c, ['status' => 'open', 'created_at' => '2026-09-13 10:00:00', 'sla_response_due_at' => '2026-09-26 10:00:00']),
            't4' => $this->ticket($a, ['category' => 'network', 'status' => 'in_progress', 'assignee_id' => $som->id, 'created_at' => '2026-09-12 10:00:00', 'sla_resolve_due_at' => '2026-09-13 10:00:00']),
            't6' => $this->ticket($a, ['status' => 'completed', 'assignee_id' => $old->id, 'created_at' => '2026-08-20 10:00:00', 'resolved_at' => '2026-08-21 10:00:00']),
        ];
    }

    // ── tickets.backlog ─────────────────────────────────────────────────────────────

    public function test_backlog_lists_live_tickets_most_overdue_first_with_time_left(): void
    {
        $this->seedTickets();
        // Opened before every other live ticket but due far ahead: age must not decide the order.
        $later = $this->ticket($this->set['t1']->requester, ['status' => 'in_progress', 'assignee_id' => $this->set['som']->id,
            'created_at' => '2026-09-02 10:00:00', 'responded_at' => '2026-09-02 11:00:00', 'sla_resolve_due_at' => '2026-10-10 10:00:00']);

        $body = $this->actingAs($this->reader())->getJson('/api/reports/r/tickets.backlog/rows')->assertOk()->json();

        $this->assertSame([$this->set['t2']->id, $this->set['t5']->id, $later->id], array_column($body['data'], 'id'));
        [$t2, $t5] = $body['data'];
        $this->assertEquals(15.0, $t2['age_days']);
        $this->assertEqualsWithDelta(-120.0, $t2['hours_left'], 0.01);
        $this->assertSame('resolve', $t2['due_kind']);
        $this->assertSame('in_progress', $t2['ticket_status']);
        $this->assertSame('Kankanok', $t2['assignee']);
        // Waiting to be taken: it runs against its response deadline.
        $this->assertSame('2026-09-26 10:00', $t5['due_at']);
        $this->assertSame('2026-09-13 10:00', $t5['opened_at']);
        $this->assertSame('response', $t5['due_kind']);
        $this->assertEqualsWithDelta(24.0, $t5['hours_left'], 0.01);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(3, $summary['total']['value']);
        $this->assertSame([1, 2], array_column($summary['total']['split'], 'value'));
        $this->assertSame(1, $summary['over_sla']['value']);
        $this->assertSame(1, $summary['due_soon']['value']);
        $this->assertSame(1, $summary['unassigned']['value']);
        // Each warning tile: its share of the backlog, and how bad it is.
        $this->assertSame(33, $summary['over_sla']['share']);
        $this->assertEquals(['label_key' => 'rep_bl_note_most_overdue', 'hours' => 120.0], $summary['over_sla']['note']);
        $this->assertSame(['label_key' => 'rep_bl_note_next_due', 'at' => '2026-09-26 10:00'], $summary['due_soon']['note']);
        $this->assertEquals(['label_key' => 'rep_bl_note_longest_wait', 'hours' => 288.0], $summary['unassigned']['note']);
        $this->assertNull($summary['total']['note']);

        $columns = collect($this->actingAs($this->reader())->getJson('/api/reports/r/tickets.backlog')->assertOk()->json('data.columns'))->keyBy('key');
        $this->assertSame('hours_left', $columns['hours_left']['type']);
        $this->assertSame('datetime', $columns['opened_at']['type']);
        $this->assertSame('datetime', $columns['due_at']['type']);
        // A ticket is reported ("ผู้แจ้ง"), not requested: its own heading key, the shared one stays for requests.
        $this->assertSame('rep_c_ticket_requester', $columns['requester']['label_key']);
        $this->assertSame('rep_c_ticket_no', $columns['ticket_no']['label_key']);
        $this->assertSame(['response' => 'rep_due_kind_response', 'resolve' => 'rep_due_kind_resolve'], $columns['due_kind']['labels']);
    }

    /** A ticket number opens the case: the column says it links, each row carries where to. */
    public function test_backlog_rows_link_to_their_case(): void
    {
        $this->seedTickets();
        $user = $this->reader();

        $definition = $this->actingAs($user)->getJson('/api/reports/r/tickets.backlog')->assertOk()->json('data.columns');
        $this->assertSame('/tickets', collect($definition)->firstWhere('key', 'ticket_no')['link']);
        $this->assertArrayNotHasKey('link', collect($definition)->firstWhere('key', 'subject') ?? []);

        foreach ($this->actingAs($user)->getJson('/api/reports/r/tickets.backlog/rows')->assertOk()->json('data') as $row) {
            $this->assertSame(['ticket_no' => "/tickets?view={$row['id']}"], $row['_links']);
        }
    }

    /** over_sla = past the deadline · due_soon = inside 24 hours · on_track = further out (or none). */
    public function test_backlog_sla_filter(): void
    {
        $this->seedTickets();
        $far = $this->ticket($this->set['t1']->requester, ['status' => 'in_progress', 'assignee_id' => $this->set['som']->id,
            'created_at' => '2026-09-20 10:00:00', 'responded_at' => '2026-09-20 11:00:00', 'sla_resolve_due_at' => '2026-10-01 10:00:00']);
        $user = $this->reader();
        $ids = fn (string $query) => array_column($this->actingAs($user)->getJson('/api/reports/r/tickets.backlog/rows?'.$query)->assertOk()->json('data'), 'id');

        $this->assertSame([$this->set['t2']->id], $ids('sla=over_sla'));
        $this->assertSame([$this->set['t5']->id], $ids('sla=due_soon'));
        $this->assertSame([$far->id], $ids('sla=on_track'));
        $this->assertSame([$this->set['t2']->id], $ids('category=software'));
    }

    public function test_backlog_assignee_filter_and_the_unassigned_queue(): void
    {
        $this->seedTickets();
        $user = $this->reader();
        $ids = fn (string $query) => array_column($this->actingAs($user)->getJson('/api/reports/r/tickets.backlog/rows?'.$query)->assertOk()->json('data'), 'id');

        $this->assertSame([$this->set['t2']->id], $ids('assignee='.$this->set['kan']->id));
        $this->assertSame([$this->set['t5']->id], $ids('assignee=none'));
        $this->actingAs($user)->getJson('/api/reports/r/tickets.backlog/rows?assignee=999999')->assertUnprocessable();

        $options = collect($this->actingAs($user)->getJson('/api/reports/r/tickets.backlog')->assertOk()->json('data.filters'))->firstWhere('name', 'assignee')['options'];
        $this->assertSame('none', $options[0]['value']);
        $this->assertContains($this->set['kan']->id, array_column($options, 'value'));
    }

    /** "ที่มา": the backlog narrows to tickets a person opened, or to those an approved request opened. */
    public function test_backlog_source_filter_and_column(): void
    {
        $this->seedTickets();
        $this->set['t5']->update(['source' => 'auto_request']);
        $user = $this->reader();
        $ids = fn (string $query) => array_column($this->actingAs($user)->getJson('/api/reports/r/tickets.backlog/rows?'.$query)->assertOk()->json('data'), 'id');

        $this->assertSame([$this->set['t5']->id], $ids('source=auto_request'));
        $this->assertSame([$this->set['t2']->id], $ids('source=manual'));
        $this->actingAs($user)->getJson('/api/reports/r/tickets.backlog/rows?source=request')->assertUnprocessable();

        $row = collect($this->actingAs($user)->getJson('/api/reports/r/tickets.backlog/rows')->json('data'))->firstWhere('id', $this->set['t5']->id);
        $this->assertSame('auto_request', $row['source']);
        $columns = collect($this->actingAs($user)->getJson('/api/reports/r/tickets.backlog')->json('data.columns'))->keyBy('key');
        $this->assertSame(['manual' => 'rep_source_manual', 'auto_request' => 'rep_source_auto_request'], $columns['source']['labels']);
        // The board follows the same filter.
        $this->assertSame([$this->set['t5']->id], array_column(
            $this->actingAs($user)->getJson('/api/reports/tickets/backlog/board?source=auto_request')->assertOk()->json('data'), 'id'));
    }

    /** The due board gets every live ticket the other filters keep — unpaged, SLA filter ignored. */
    public function test_backlog_board_lists_every_live_ticket_without_the_sla_filter(): void
    {
        $this->seedTickets();
        $user = $this->reader();

        $board = $this->actingAs($user)->getJson('/api/reports/tickets/backlog/board?sla=over_sla')->assertOk()->json('data');

        $this->assertSame([$this->set['t2']->id, $this->set['t5']->id], array_column($board, 'id'));
        $this->assertSame(['name' => 'IT', 'name_th' => 'ไอที'], $board[0]['department']);
        $this->assertSame('2026-09-20 10:00', $board[0]['due_at']);
        $this->assertSame('resolve', $board[0]['due_kind']);
        $this->assertSame('Kankanok', $board[0]['assignee']);
        $this->assertNull($board[1]['assignee']);
        $this->assertSame('response', $board[1]['due_kind']);

        $this->assertSame([$this->set['t2']->id], array_column(
            $this->actingAs($user)->getJson('/api/reports/tickets/backlog/board?category=software')->assertOk()->json('data'), 'id'));
        $this->actingAs($this->userWith(['tickets.view_all', 'tickets.level_hardware']))
            ->getJson('/api/reports/tickets/backlog/board')->assertForbidden();
    }

    // ── access & export ─────────────────────────────────────────────────────────────

    public function test_ticket_reports_need_view_all_and_resolve(): void
    {
        $viewer = $this->userWith(['tickets.view_all', 'tickets.level_hardware']);

        foreach (['tickets.backlog'] as $key) {
            $this->actingAs($viewer)->getJson("/api/reports/r/{$key}/rows")->assertForbidden();
        }
    }

    /** The Excel sheet carries what the page leaves out — description, both SLA deadlines, the SLA bucket — grouped for analysis. */
    public function test_backlog_sheet_adds_analysis_columns_in_groups(): void
    {
        Excel::fake();
        $this->seedTickets();
        $user = $this->reader();

        // The page and its rows never see the sheet-only columns.
        $screen = array_column($this->actingAs($user)->getJson('/api/reports/r/tickets.backlog')->assertOk()->json('data.columns'), 'key');
        $this->assertNotContains('description', $screen);
        $this->assertNotContains('response_due_at', $screen);
        $this->assertArrayNotHasKey('description', $this->actingAs($user)->getJson('/api/reports/r/tickets.backlog/rows')->json('data.0'));

        // A column picked down to two still exports the sheet-only ones.
        $this->actingAs($user)->exportReport('/api/reports/r/tickets.backlog/export?format=xlsx&columns[]=ticket_no&columns[]=hours_left')->assertAccepted();
        $this->assertExportStored('Report_tickets-backlog_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheet = last($export->sheets());
            $headings = $sheet->headings();
            $this->assertSame(['เลขที่ Ticket', 'รายละเอียด', 'วันที่ครบกำหนด SLA รับเคส', 'วันที่ครบกำหนด SLA ปิดเคส', 'เหลือ (ชม.)', 'สถานะ SLA'], $headings);

            // Most overdue first: t2 (resolve due the 20th) is over SLA, t5 (response due in 24 h) due soon.
            $rows = $export->rows->map(fn (Ticket $t) => array_combine($headings, $sheet->map($t)))->keyBy('เลขที่ Ticket');
            $t2 = $rows[$this->set['t2']->ticket_no];
            $t5 = $rows[$this->set['t5']->ticket_no];
            $this->assertSame('เกิน SLA', $t2['สถานะ SLA']);
            $this->assertSame('2026-09-20 10:00', $t2['วันที่ครบกำหนด SLA ปิดเคส']);
            $this->assertSame('ใกล้ครบ (ภายใน 24 ชม.)', $t5['สถานะ SLA']);
            $this->assertSame('2026-09-26 10:00', $t5['วันที่ครบกำหนด SLA รับเคส']);
            $this->assertSame(trim($this->set['t5']->description), $t5['รายละเอียด']);

            return true;
        });

        // Every column: the case, who, where it stands, then its SLA.
        $this->actingAs($user)->exportReport('/api/reports/r/tickets.backlog/export?format=xlsx')->assertAccepted();
        $this->assertExportStored('Report_tickets-backlog_2026-09-25.xlsx', fn (TabularReportExport $export) => last($export->sheets())->headings() === [
            'เลขที่ Ticket', 'เรื่อง', 'รายละเอียด', 'หมวด', 'ความสำคัญ', 'ที่มา',
            'ผู้แจ้ง', 'แผนก', 'ผู้รับผิดชอบ',
            'สถานะ', 'วันที่แจ้ง', 'ค้างมา (วัน)',
            'วันที่ครบกำหนด SLA รับเคส', 'วันที่ครบกำหนด SLA ปิดเคส', 'เงื่อนไข SLA (ในสถานะปัจจุบัน)', 'วันที่ครบกำหนด SLA (ในสถานะปัจจุบัน)', 'เหลือ (ชม.)', 'สถานะ SLA',
        ]);
    }

    public function test_pdf_exports_stream_a_pdf(): void
    {
        $this->seedTickets();
        $user = $this->reader();

        foreach (['tickets.backlog'] as $key) {
            $response = $this->actingAs($user)->exportReport("/api/reports/r/{$key}/export?format=pdf");
            $response->assertOk();
            $this->assertSame('application/pdf', $response->headers->get('Content-Type'), $key);
        }
    }
}
