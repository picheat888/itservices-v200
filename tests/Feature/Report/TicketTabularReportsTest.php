<?php

namespace Tests\Feature\Report;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ExportsReports;
use Tests\TestCase;

/**
 * The three ticket tabular reports — "Ticket ตามแผนกและหมวด" (tickets.by_department),
 * "ผลงานเจ้าหน้าที่ IT" (tickets.staff_performance) and "Ticket ค้างและเกิน SLA"
 * (tickets.backlog) — over one shared set of tickets. The reader holds hardware and software
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

    // ── tickets.by_department ───────────────────────────────────────────────────────

    public function test_by_department_splits_categories_within_the_readers_levels(): void
    {
        $this->seedTickets();

        $body = $this->actingAs($this->reader())->getJson('/api/reports/r/tickets.by_department/rows')->assertOk()->json();

        $this->assertSame(3, $body['meta']['total']);
        $this->assertSame(['name' => 'IT', 'name_th' => 'ไอที'], $body['data'][0]['department']);
        $rows = collect($body['data'])->keyBy(fn (array $r) => $r['department']['name']);
        $it = $rows['IT'];
        $this->assertEquals(4, $it['total_count']);
        $this->assertEquals(3, $it['cat_hardware']);
        $this->assertEquals(1, $it['cat_software']);
        // No network level: the column is unknown, not zero.
        $this->assertNull($it['cat_network']);
        $this->assertEquals(1, $it['live_count']);
        $this->assertEquals(100, $it['sla_rate']);
        $this->assertEquals(0, $rows['Sales']['sla_rate']);
        $this->assertEquals(1, $rows['No department']['total_count']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(6, $summary['total']['value']);
        $this->assertSame(3, $summary['departments']['value']);
        $this->assertSame(2, $summary['live']['value']);
        $this->assertSame(67, $summary['sla_rate']['value']);
    }

    public function test_by_department_follows_the_date_range(): void
    {
        $this->seedTickets();

        $body = $this->actingAs($this->reader())
            ->getJson('/api/reports/r/tickets.by_department/rows?from=2026-08-01&to=2026-08-31')->assertOk()->json();

        $this->assertCount(1, $body['data']);
        $this->assertEquals(1, $body['data'][0]['total_count']);
    }

    // ── tickets.staff_performance ───────────────────────────────────────────────────

    public function test_staff_performance_counts_what_each_person_closed_and_holds(): void
    {
        $this->seedTickets();

        $body = $this->actingAs($this->reader())->getJson('/api/reports/r/tickets.staff_performance/rows')->assertOk()->json();

        $this->assertSame(['Kankanok', 'Somsak'], array_column($body['data'], 'staff'));
        [$kan, $som] = $body['data'];
        $this->assertEquals(2, $kan['completed_count']);
        $this->assertEquals(1, $kan['canceled_count']);
        // Nearest-rank median of [24, 48] — the Ticket & SLA overview's own measure.
        $this->assertEquals(24.0, $kan['median_resolve_hours']);
        $this->assertEquals(100, $kan['sla_rate']);
        $this->assertEquals(1, $kan['in_hand']);
        $this->assertEquals(1, $kan['breached_in_hand']);
        $this->assertEquals(192.0, $som['median_resolve_hours']);
        $this->assertEquals(0, $som['sla_rate']);
        // Somsak's network ticket sits outside the reader's levels.
        $this->assertEquals(0, $som['in_hand']);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(2, $summary['total']['value']);
        $this->assertSame(3, $summary['completed']['value']);
        $this->assertSame(67, $summary['sla_rate']['value']);
    }

    public function test_staff_performance_filters_by_category(): void
    {
        $this->seedTickets();
        $user = $this->reader();

        $software = $this->actingAs($user)->getJson('/api/reports/r/tickets.staff_performance/rows?category=software')->assertOk()->json('data');
        $this->assertSame(['Kankanok'], array_column($software, 'staff'));
        $this->assertEquals(0, $software[0]['completed_count']);
        $this->assertNull($software[0]['median_resolve_hours']);

        $network = $this->actingAs($user)->getJson('/api/reports/r/tickets.staff_performance/rows?category=network')->assertOk()->json('data');
        $this->assertSame([], $network);
    }

    // ── tickets.backlog ─────────────────────────────────────────────────────────────

    public function test_backlog_lists_live_tickets_oldest_first_with_time_left(): void
    {
        $this->seedTickets();

        $body = $this->actingAs($this->reader())->getJson('/api/reports/r/tickets.backlog/rows')->assertOk()->json();

        $this->assertSame([$this->set['t2']->id, $this->set['t5']->id], array_column($body['data'], 'id'));
        [$t2, $t5] = $body['data'];
        $this->assertEquals(15.0, $t2['age_days']);
        $this->assertEqualsWithDelta(-120.0, $t2['hours_left'], 0.01);
        $this->assertSame('in_progress', $t2['ticket_status']);
        $this->assertSame('Kankanok', $t2['assignee']);
        $this->assertSame('2026-09-26', $t5['due_at']);
        $this->assertEqualsWithDelta(24.0, $t5['hours_left'], 0.01);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(2, $summary['total']['value']);
        $this->assertSame(1, $summary['open']['value']);
        $this->assertSame(1, $summary['in_progress']['value']);
        $this->assertSame(1, $summary['breached']['value']);
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

    public function test_backlog_sla_filter(): void
    {
        $this->seedTickets();
        $user = $this->reader();
        $ids = fn (string $query) => array_column($this->actingAs($user)->getJson('/api/reports/r/tickets.backlog/rows?'.$query)->assertOk()->json('data'), 'id');

        $this->assertSame([$this->set['t2']->id], $ids('sla=breached'));
        $this->assertSame([$this->set['t5']->id], $ids('sla=on_track'));
        $this->assertSame([$this->set['t2']->id], $ids('category=software'));
    }

    // ── access & export ─────────────────────────────────────────────────────────────

    public function test_ticket_reports_need_view_all_and_resolve(): void
    {
        $viewer = $this->userWith(['tickets.view_all', 'tickets.level_hardware']);

        foreach (['tickets.by_department', 'tickets.staff_performance', 'tickets.backlog'] as $key) {
            $this->actingAs($viewer)->getJson("/api/reports/r/{$key}/rows")->assertForbidden();
        }
    }

    public function test_pdf_exports_stream_a_pdf(): void
    {
        $this->seedTickets();
        $user = $this->reader();

        foreach (['tickets.by_department', 'tickets.staff_performance', 'tickets.backlog'] as $key) {
            $response = $this->actingAs($user)->exportReport("/api/reports/r/{$key}/export?format=pdf");
            $response->assertOk();
            $this->assertSame('application/pdf', $response->headers->get('Content-Type'), $key);
        }
    }
}
