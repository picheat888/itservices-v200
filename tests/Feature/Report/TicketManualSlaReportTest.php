<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Exports\Report\TabularSectionSheet;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Support\TicketSla;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * "สรุปผล SLA ของ Ticket ที่ผู้ใช้เปิดเอง" (tickets.manual_sla): tickets employees opened themselves,
 * grouped by a dimension the reader picks. The reader holds hardware and software levels only.
 *
 * September 2026, as of the 25th 10:00 (response target due 2 h after opening):
 *  m1 hw critical  completed   Kan  taken in 30 min (met)  closed before due (met)
 *  m2 hw high      completed   Som  taken in 30 min (met)  closed 3 h past due (late)
 *  m3 sw medium    completed   Kan  taken in 1 h (met)     closed 30 h past due (late), repair by a vendor
 *  m4 hw —         open        —    never taken, response due the 20th — over SLA now
 *  m5 sw low       canceled    Kan  taken in 1 h (met)     — not judged on closing
 *  m6 sw medium    in progress Som  taken in 30 min (met)  resolve due the 30th — still in time
 * Left out: a ticket opened from a request, a network ticket (outside the reader's levels), an August ticket.
 */
class TicketManualSlaReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;

    private const RANGE = 'from=2026-09-01&to=2026-09-30';

    /** @var array<string, Ticket> */
    private array $set = [];

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

    /** @param array<string, mixed> $attributes */
    private function ticket(string $opened, array $attributes): Ticket
    {
        return Ticket::factory()->create(array_merge([
            'requester_id' => Employee::create(['first_name' => 'Anan', 'last_name' => 'User'])->id,
            'category' => 'hardware',
            'source' => 'manual',
            'created_at' => $opened,
            'sla_response_due_at' => date('Y-m-d H:i:s', strtotime($opened) + 2 * 3600),
        ], $attributes));
    }

    private function seedTickets(): void
    {
        $kan = User::factory()->create(['name' => 'Kankanok']);
        $som = User::factory()->create(['name' => 'Somsak']);

        $this->set = [
            'm1' => $this->ticket('2026-09-01 10:00:00', ['priority' => 'critical', 'status' => 'completed', 'assignee_id' => $kan->id,
                'responded_at' => '2026-09-01 10:30:00', 'resolved_at' => '2026-09-01 13:00:00', 'sla_resolve_due_at' => '2026-09-01 14:30:00']),
            'm2' => $this->ticket('2026-09-02 10:00:00', ['priority' => 'high', 'status' => 'completed', 'assignee_id' => $som->id,
                'responded_at' => '2026-09-02 10:30:00', 'resolved_at' => '2026-09-03 13:00:00', 'sla_resolve_due_at' => '2026-09-03 10:00:00']),
            'm3' => $this->ticket('2026-09-03 10:00:00', ['category' => 'software', 'priority' => 'medium', 'work_class' => 'repair_vendor', 'status' => 'completed',
                'assignee_id' => $kan->id, 'responded_at' => '2026-09-03 11:00:00', 'resolved_at' => '2026-09-08 16:00:00', 'sla_resolve_due_at' => '2026-09-07 10:00:00']),
            'm4' => $this->ticket('2026-09-20 08:00:00', ['status' => 'open', 'sla_response_due_at' => '2026-09-20 10:00:00']),
            'm5' => $this->ticket('2026-09-04 10:00:00', ['category' => 'software', 'priority' => 'low', 'status' => 'canceled', 'assignee_id' => $kan->id,
                'responded_at' => '2026-09-04 11:00:00', 'resolved_at' => '2026-09-05 10:00:00']),
            'm6' => $this->ticket('2026-09-10 10:00:00', ['category' => 'software', 'priority' => 'medium', 'status' => 'in_progress', 'assignee_id' => $som->id,
                'responded_at' => '2026-09-10 10:30:00', 'sla_resolve_due_at' => '2026-09-30 10:00:00']),
            'request' => $this->ticket('2026-09-02 10:00:00', ['source' => 'auto_request', 'status' => 'open']),
            'network' => $this->ticket('2026-09-02 10:00:00', ['category' => 'network', 'status' => 'open']),
            'august' => $this->ticket('2026-08-20 10:00:00', ['status' => 'completed', 'resolved_at' => '2026-08-21 10:00:00']),
        ];
    }

    /** @param list<string> $keys */
    private function ids(array $keys): array
    {
        return array_map(fn (string $k) => $this->set[$k]->id, $keys);
    }

    public function test_rows_list_only_tickets_users_opened_that_the_reader_may_count_newest_first(): void
    {
        $this->seedTickets();

        $body = $this->actingAs($this->reader())->getJson('/api/reports/r/tickets.manual_sla/rows?'.self::RANGE)->assertOk()->json();

        $this->assertSame($this->ids(['m4', 'm6', 'm5', 'm3', 'm2', 'm1']), array_column($body['data'], 'id'));

        $rows = collect($body['data'])->keyBy('id');
        $this->assertSame(['met', 'met'], [$rows[$this->set['m1']->id]['take_sla'], $rows[$this->set['m1']->id]['close_sla']]);
        $this->assertSame(['met', 'missed'], [$rows[$this->set['m2']->id]['take_sla'], $rows[$this->set['m2']->id]['close_sla']]);
        // Never taken, past its response deadline: over on taking, closing not started.
        $this->assertSame(['over', null], [$rows[$this->set['m4']->id]['take_sla'], $rows[$this->set['m4']->id]['close_sla']]);
        $this->assertNull($rows[$this->set['m5']->id]['close_sla']);
        $this->assertSame('critical', $rows[$this->set['m1']->id]['priority']);
    }

    public function test_summary_tiles_judge_closing_on_completed_cases_and_taking_on_taken_ones(): void
    {
        $this->seedTickets();

        $summary = collect($this->actingAs($this->reader())->getJson('/api/reports/r/tickets.manual_sla/rows?'.self::RANGE)->assertOk()->json('summary'))->keyBy('key');

        $this->assertSame(6, $summary['ms_total']['value']);
        $this->assertSame([3, 1, 2], array_column($summary['ms_total']['split'], 'value'));
        // 1 of 3 completed closed in time; 5 of 5 taken in time (m4 was never taken).
        $this->assertSame(33, $summary['ms_close_rate']['value']);
        $this->assertSame(90, $summary['ms_close_rate']['goal']);
        $this->assertSame(['met' => 5, 'n' => 5], $summary['ms_take_rate']['note']['values']);
        $this->assertSame(1, $summary['ms_over_sla']['value']);
        $this->assertSame([1, 0], array_column($summary['ms_over_sla']['split'], 'value'));
    }

    public function test_breakdown_groups_by_category_by_default_with_the_open_cases_the_lateness_and_the_rules(): void
    {
        $this->seedTickets();

        $data = $this->actingAs($this->reader())->getJson('/api/reports/tickets/manual-sla/breakdown?'.self::RANGE)->assertOk()->json('data');

        $this->assertSame('category', $data['by']);
        // Busiest first; a tie reads in key order.
        $this->assertSame(['hardware', 'software'], array_column($data['groups'], 'key'));
        [$hw, $sw] = $data['groups'];
        $this->assertSame([3, 2, 0, 1], [$hw['total'], $hw['completed'], $hw['canceled'], $hw['open']]);
        $this->assertSame([2, 2, 1, 2], [$hw['take_met'], $hw['take_total'], $hw['close_met'], $hw['close_total']]);
        $this->assertSame([3, 1, 1, 1], [$sw['total'], $sw['completed'], $sw['canceled'], $sw['open']]);
        $this->assertSame(6, $data['overall']['total']);

        $this->assertSame($this->ids(['m4']), array_column($data['open'], 'id'));
        $this->assertSame('response', $data['open'][0]['due_kind']);

        // m2 closed 3 h late, m3 30 h late.
        $this->assertSame(2, $data['late']['total']);
        $this->assertSame(['under_1h' => 0, '1_8h' => 1, '8_24h' => 0, '1_3d' => 1, 'over_3d' => 0], array_column($data['late']['bands'], 'n', 'key'));
        $this->assertEquals(3.0, $data['late']['median_hours']);
        $this->assertSame(1, $data['late']['near']);

        $this->assertSame(120, $data['rules']['response_minutes']);
        $this->assertSame(['critical', 'high', 'medium', 'low'], array_column($data['rules']['resolve'], 'priority'));
        $this->assertSame(4, $data['rules']['resolve'][0]['hours']);
        $this->assertSame(0, $data['rules']['repair_rules']);
        $this->assertSame('08:00', $data['rules']['hours']['start']);
    }

    public function test_breakdown_by_priority_lines_up_most_urgent_first_with_not_assessed_last(): void
    {
        $this->seedTickets();

        $groups = $this->actingAs($this->reader())->getJson('/api/reports/tickets/manual-sla/breakdown?'.self::RANGE.'&by=priority')->assertOk()->json('data.groups');

        $this->assertSame(['critical', 'high', 'medium', 'low', 'none'], array_column($groups, 'key'));
        $this->assertSame(2, $groups[2]['total']);
    }

    public function test_breakdown_by_assignee_names_people_and_puts_nobody_last(): void
    {
        $this->seedTickets();

        $groups = $this->actingAs($this->reader())->getJson('/api/reports/tickets/manual-sla/breakdown?'.self::RANGE.'&by=assignee')->assertOk()->json('data.groups');

        $this->assertSame(['Kankanok', 'Somsak', null], array_column($groups, 'label'));
        $this->assertSame('none', end($groups)['key']);
    }

    public function test_a_dimensions_own_filter_narrows_the_rows_but_not_its_table(): void
    {
        $this->seedTickets();
        $user = $this->reader();

        $rows = $this->actingAs($user)->getJson('/api/reports/r/tickets.manual_sla/rows?'.self::RANGE.'&category=software')->assertOk()->json('data');
        $this->assertSame($this->ids(['m6', 'm5', 'm3']), array_column($rows, 'id'));

        $groups = $this->actingAs($user)->getJson('/api/reports/tickets/manual-sla/breakdown?'.self::RANGE.'&category=software')->assertOk()->json('data.groups');
        $this->assertSame(['hardware', 'software'], array_column($groups, 'key'));

        // Another dimension's filter does narrow the table.
        $groups = $this->actingAs($user)->getJson('/api/reports/tickets/manual-sla/breakdown?'.self::RANGE.'&priority=medium')->assertOk()->json('data.groups');
        $this->assertSame(['software'], array_column($groups, 'key'));

        $rows = $this->actingAs($user)->getJson('/api/reports/r/tickets.manual_sla/rows?'.self::RANGE.'&priority=none')->assertOk()->json('data');
        $this->assertSame($this->ids(['m4']), array_column($rows, 'id'));
        $rows = $this->actingAs($user)->getJson('/api/reports/r/tickets.manual_sla/rows?'.self::RANGE.'&work_class=repair_vendor')->assertOk()->json('data');
        $this->assertSame($this->ids(['m3']), array_column($rows, 'id'));
    }

    public function test_it_needs_the_same_permissions_as_the_other_ticket_reports(): void
    {
        $this->seedTickets();
        $viewer = $this->userWith(['tickets.view_all', 'tickets.level_hardware']);

        $this->actingAs($viewer)->getJson('/api/reports/r/tickets.manual_sla/rows')->assertForbidden();
        $this->actingAs($viewer)->getJson('/api/reports/tickets/manual-sla/breakdown')->assertForbidden();

        $keys = array_column($this->actingAs($this->reader())->getJson('/api/reports')->assertOk()->json('data'), 'key');
        $this->assertContains('tickets.manual_sla', $keys);
    }

    public function test_excel_export_carries_the_table_grouped_the_way_the_page_was(): void
    {
        Excel::fake();
        $this->seedTickets();

        $this->actingAs($this->reader())
            ->exportReport('/api/reports/r/tickets.manual_sla/export?format=xlsx&by=priority&'.self::RANGE)->assertAccepted();

        $this->assertExportStored('Report_tickets-manual_sla_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheets = $export->sheets();
            $this->assertCount(3, $sheets);
            $this->assertSame('สรุปผล SLA ของ Ticket ที่ผู้ใช้เปิดเอง', $sheets[0]->array()[0][0]);
            $this->assertInstanceOf(TabularSectionSheet::class, $sheets[1]);
            $this->assertSame('ตามความสำคัญ', $sheets[1]->title());

            $lines = $sheets[1]->array();
            $this->assertSame(['วิกฤต', 1, 1, 0, 0, '1/1', 100, '1/1', 100, 0.5, 3.0], $lines[0]);
            $this->assertSame('ยังไม่ประเมิน', $lines[4][0]);

            return end($lines)[0] === 'รวม';
        });
    }
}
