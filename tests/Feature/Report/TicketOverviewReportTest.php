<?php

namespace Tests\Feature\Report;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * "Ticket & SLA overview" report: every number the page draws is checked against
 * tickets placed deliberately around the edges of the date range and the viewer's
 * ticket levels.
 */
class TicketOverviewReportTest extends TestCase
{
    use RefreshDatabase;

    private const RANGE = ['from' => '2026-09-01', 'to' => '2026-09-30'];

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
    }

    /** @param list<string> $levels */
    private function deskMember(array $levels = ['hardware', 'software']): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        $permissions = ['tickets.view_all', 'tickets.resolve', ...array_map(fn (string $l) => "tickets.level_{$l}", $levels)];
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @param array<string, mixed> $attributes */
    private function ticket(array $attributes): Ticket
    {
        return Ticket::factory()->create(array_merge(['category' => 'hardware'], $attributes));
    }

    /** @param array<string, mixed> $extra */
    private function summary(User $user, array $extra = []): array
    {
        return $this->actingAs($user)
            ->getJson('/api/reports/tickets/overview?'.http_build_query(array_merge(self::RANGE, $extra)))
            ->assertOk()
            ->json('data');
    }

    public function test_it_refuses_a_reader_without_the_desk_permissions(): void
    {
        $role = Role::create(['key' => 'plain', 'name' => 'Plain', 'is_system' => false]);
        RolePermission::create(['role_id' => $role->id, 'permission' => 'tickets.view_all', 'allowed' => true]);
        $user = User::factory()->create(['role' => 'plain']);

        $this->actingAs($user)->getJson('/api/reports/tickets/overview?'.http_build_query(self::RANGE))->assertForbidden();
    }

    public function test_it_validates_the_date_range(): void
    {
        $user = $this->deskMember();

        $this->actingAs($user)->getJson('/api/reports/tickets/overview?from=2026-09-30&to=2026-09-01')
            ->assertUnprocessable()->assertJsonValidationErrors('to');
        $this->actingAs($user)->getJson('/api/reports/tickets/overview?from=2025-01-01&to=2026-09-30')
            ->assertUnprocessable()->assertJsonValidationErrors('to');
        $this->actingAs($user)->getJson('/api/reports/tickets/overview?from=2026-09-01&to=2026-09-30&categories[]=bogus')
            ->assertUnprocessable()->assertJsonValidationErrors('categories.0');
    }

    public function test_kpis_count_only_tickets_opened_in_the_range(): void
    {
        $user = $this->deskMember();
        // Met: resolved 2h after opening, due in 4h.
        $this->ticket(['status' => 'completed', 'priority' => 'critical', 'created_at' => '2026-09-02 09:00',
            'resolved_at' => '2026-09-02 11:00', 'sla_resolve_due_at' => '2026-09-02 13:00']);
        // Breached: resolved 10h after opening, due in 8h.
        $this->ticket(['status' => 'completed', 'priority' => 'high', 'created_at' => '2026-09-03 08:00',
            'resolved_at' => '2026-09-03 18:00', 'sla_resolve_due_at' => '2026-09-03 16:00']);
        $this->ticket(['status' => 'canceled', 'created_at' => '2026-09-04 08:00']);
        $this->ticket(['status' => 'open', 'created_at' => '2026-09-24 08:00']);
        // Outside the range on both sides.
        $this->ticket(['status' => 'completed', 'created_at' => '2026-08-31 23:59', 'resolved_at' => '2026-09-01 08:00']);
        $this->ticket(['status' => 'open', 'created_at' => '2026-10-01 00:00']);

        $kpi = $this->summary($user)['kpi'];

        $this->assertSame(4, $kpi['total']);
        $this->assertSame(2, $kpi['completed']);
        $this->assertSame(1, $kpi['canceled']);
        $this->assertSame(2, $kpi['sla_measured']);
        $this->assertSame(1, $kpi['sla_met']);
        $this->assertEquals(50.0, $kpi['sla_rate']);
        // Mean of [2, 10] is 6; nearest-rank P90 is 10.
        $this->assertEquals(6.0, $kpi['avg_resolve_hours']);
        $this->assertEquals(10.0, $kpi['p90_resolve_hours']);
    }

    public function test_an_empty_range_reports_null_rates_not_zero(): void
    {
        $kpi = $this->summary($this->deskMember())['kpi'];

        $this->assertSame(0, $kpi['total']);
        $this->assertNull($kpi['sla_rate']);
        $this->assertNull($kpi['avg_resolve_hours']);
    }

    public function test_categories_outside_the_viewers_levels_are_invisible(): void
    {
        $user = $this->deskMember(['hardware']);
        $this->ticket(['category' => 'hardware', 'created_at' => '2026-09-05 08:00']);
        $this->ticket(['category' => 'network', 'created_at' => '2026-09-05 08:00']);

        $this->assertSame(1, $this->summary($user)['kpi']['total']);
        // Asking for a category you cannot see does not widen the scope.
        $this->assertSame(0, $this->summary($user, ['categories' => ['network']])['kpi']['total']);
        // The category filter itself only ever offers the viewer's own levels.
        $this->assertSame(['hardware'], $this->summary($user)['options']['categories']);
    }

    public function test_department_priority_and_assignee_filters_narrow_the_population(): void
    {
        $user = $this->deskMember();
        $sales = Department::create(['name' => 'Sales']);
        $seller = Employee::create(['first_name' => 'S', 'status' => 'active', 'department_id' => $sales->id]);
        $tech = User::factory()->create();

        $this->ticket(['requester_id' => $seller->id, 'priority' => 'high', 'assignee_id' => $tech->id, 'created_at' => '2026-09-05 08:00']);
        $this->ticket(['priority' => 'low', 'created_at' => '2026-09-05 08:00']);

        $this->assertSame(1, $this->summary($user, ['department_id' => $sales->id])['kpi']['total']);
        $this->assertSame(1, $this->summary($user, ['priority' => 'high'])['kpi']['total']);
        $this->assertSame(1, $this->summary($user, ['assignee_id' => $tech->id])['kpi']['total']);
    }

    public function test_backlog_ignores_the_date_range_and_flags_breaches_and_age(): void
    {
        $user = $this->deskMember();
        // Opened long before the range, still open, response deadline passed.
        $this->ticket(['status' => 'open', 'created_at' => '2026-06-01 08:00', 'sla_response_due_at' => '2026-06-01 10:00']);
        // Taken today, resolve deadline tomorrow.
        $this->ticket(['status' => 'in_progress', 'created_at' => '2026-09-25 08:00', 'responded_at' => '2026-09-25 08:30',
            'sla_resolve_due_at' => '2026-09-26 08:00']);
        $this->ticket(['status' => 'completed', 'created_at' => '2026-09-20 08:00', 'resolved_at' => '2026-09-20 09:00']);

        $backlog = $this->summary($user)['backlog'];

        $this->assertSame(1, $backlog['open']);
        $this->assertSame(1, $backlog['in_progress']);
        $this->assertSame(1, $backlog['over_sla']);
        $this->assertSame(['d1' => 1, 'd3' => 0, 'd7' => 0, 'older' => 1], $backlog['aging']);
    }

    public function test_weekly_buckets_start_on_monday_and_cover_the_whole_range(): void
    {
        $user = $this->deskMember();
        // 2026-09-01 is a Tuesday → the first bucket is Monday 2026-08-31.
        $this->ticket(['status' => 'completed', 'created_at' => '2026-09-01 08:00', 'resolved_at' => '2026-09-08 08:00']);

        $weekly = $this->summary($user)['weekly'];

        $this->assertSame('2026-08-31', $weekly[0]['week_start']);
        $this->assertSame('2026-09-28', $weekly[array_key_last($weekly)]['week_start']);
        $this->assertCount(5, $weekly);
        $this->assertSame(1, $weekly[0]['opened']);
        $this->assertSame(0, $weekly[0]['closed']);
        $this->assertSame(1, $weekly[1]['closed']);
    }

    public function test_weekly_backlog_counts_tickets_still_open_at_each_week_end(): void
    {
        $user = $this->deskMember();
        // Opened before the range, closed in week 2 (Mon 2026-09-07 .. Sun 09-13).
        $this->ticket(['status' => 'completed', 'created_at' => '2026-08-20 08:00', 'resolved_at' => '2026-09-09 08:00']);
        // Opened in week 1, still open — counts from week 1 on.
        $this->ticket(['status' => 'open', 'created_at' => '2026-09-02 08:00']);
        // Opened in week 3, canceled in week 4 — resolved_at stamps a cancel too.
        $this->ticket(['status' => 'canceled', 'created_at' => '2026-09-15 08:00', 'resolved_at' => '2026-09-22 08:00']);
        // Closed before the range — never counted.
        $this->ticket(['status' => 'completed', 'created_at' => '2026-08-01 08:00', 'resolved_at' => '2026-08-03 08:00']);

        $backlog = array_column($this->summary($user)['weekly'], 'backlog');

        // Week 5 (from 09-28) is after "now" (09-25 10:00), so it reads the backlog as of now.
        $this->assertSame([2, 1, 2, 1, 1], $backlog);
    }

    public function test_breakdowns_by_priority_category_department_and_assignee(): void
    {
        $user = $this->deskMember();
        $ops = Department::create(['name' => 'Operations', 'name_th' => 'ปฏิบัติการ']);
        $worker = Employee::create(['first_name' => 'W', 'status' => 'active', 'department_id' => $ops->id]);
        $tech = User::factory()->create(['name' => 'Tech One']);

        $this->ticket(['category' => 'software', 'priority' => 'critical', 'status' => 'completed', 'requester_id' => $worker->id,
            'assignee_id' => $tech->id, 'created_at' => '2026-09-02 08:00', 'resolved_at' => '2026-09-02 09:00',
            'sla_resolve_due_at' => '2026-09-02 12:00']);
        $this->ticket(['category' => 'software', 'created_at' => '2026-09-03 08:00', 'requester_id' => $worker->id]);
        $this->ticket(['category' => 'hardware', 'created_at' => '2026-09-03 08:00']);

        $data = $this->summary($user);

        $critical = collect($data['sla_by_priority'])->firstWhere('priority', 'critical');
        $this->assertEquals(['priority' => 'critical', 'measured' => 1, 'met' => 1, 'rate' => 100.0], $critical);
        $this->assertSame(['category' => 'software', 'count' => 2], $data['by_category'][0]);
        $this->assertSame('Operations', $data['by_department'][0]['name']);
        $this->assertSame('ปฏิบัติการ', $data['by_department'][0]['name_th']);
        $this->assertSame(2, $data['by_department'][0]['count']);
        $this->assertSame($tech->id, $data['by_assignee'][0]['assignee_id']);
        $this->assertSame('Tech One', $data['by_assignee'][0]['name']);
        $this->assertSame(1, $data['by_assignee'][0]['completed']);
        $this->assertEquals(1.0, $data['by_assignee'][0]['avg_resolve_hours']);
    }

    /**
     * The set the department and staff cards are checked against — September, as of the 25th 10:00:
     *  t1 hw  IT     kan  completed 5th→6th (24h)    met
     *  t7 hw  IT     kan  completed 1st→3rd (48h)    met
     *  t8 hw  IT     kan  canceled 8th
     *  t2 sw  IT     kan  in progress, resolve due 20th (breached)
     *  t3 hw  Sales  som  completed 12th→20th (192h) breached
     *  t5 hw  —      —    open, response due 26th (on track)
     *  t4 nw  IT     som  in progress — outside the reader's levels
     *  t6 hw  IT     old  completed in August — outside the range
     *  t9 hw  IT     late opened in August, completed 2nd (counts for staff, not for departments)
     *
     * @return array<string, User>
     */
    private function seedDeskSet(): array
    {
        $it = Department::create(['name' => 'IT', 'name_th' => 'ไอที']);
        $sales = Department::create(['name' => 'Sales', 'name_th' => 'ฝ่ายขาย']);
        $a = Employee::create(['first_name' => 'Anan', 'status' => 'active', 'department_id' => $it->id]);
        $b = Employee::create(['first_name' => 'Bua', 'status' => 'active', 'department_id' => $sales->id]);
        $c = Employee::create(['first_name' => 'Chai', 'status' => 'active']);
        $staff = [
            'kan' => User::factory()->create(['name' => 'Kankanok']),
            'som' => User::factory()->create(['name' => 'Somsak']),
            'old' => User::factory()->create(['name' => 'Old timer']),
            'late' => User::factory()->create(['name' => 'Latecomer']),
        ];

        $this->ticket(['requester_id' => $a->id, 'status' => 'completed', 'assignee_id' => $staff['kan']->id, 'created_at' => '2026-09-05 10:00', 'resolved_at' => '2026-09-06 10:00', 'sla_resolve_due_at' => '2026-09-07 10:00']);
        $this->ticket(['requester_id' => $a->id, 'status' => 'completed', 'assignee_id' => $staff['kan']->id, 'created_at' => '2026-09-01 10:00', 'resolved_at' => '2026-09-03 10:00', 'sla_resolve_due_at' => '2026-09-04 10:00']);
        $this->ticket(['requester_id' => $a->id, 'status' => 'canceled', 'assignee_id' => $staff['kan']->id, 'created_at' => '2026-09-07 10:00', 'resolved_at' => '2026-09-08 10:00']);
        $this->ticket(['requester_id' => $a->id, 'category' => 'software', 'status' => 'in_progress', 'assignee_id' => $staff['kan']->id, 'created_at' => '2026-09-10 10:00', 'responded_at' => '2026-09-10 11:00', 'sla_resolve_due_at' => '2026-09-20 10:00']);
        $this->ticket(['requester_id' => $b->id, 'status' => 'completed', 'assignee_id' => $staff['som']->id, 'created_at' => '2026-09-12 10:00', 'resolved_at' => '2026-09-20 10:00', 'sla_resolve_due_at' => '2026-09-15 10:00']);
        $this->ticket(['requester_id' => $c->id, 'status' => 'open', 'created_at' => '2026-09-13 10:00', 'sla_response_due_at' => '2026-09-26 10:00']);
        $this->ticket(['requester_id' => $a->id, 'category' => 'network', 'status' => 'in_progress', 'assignee_id' => $staff['som']->id, 'created_at' => '2026-09-12 10:00', 'sla_resolve_due_at' => '2026-09-13 10:00']);
        $this->ticket(['requester_id' => $a->id, 'status' => 'completed', 'assignee_id' => $staff['old']->id, 'created_at' => '2026-08-20 10:00', 'resolved_at' => '2026-08-21 10:00']);
        $this->ticket(['requester_id' => $a->id, 'status' => 'completed', 'assignee_id' => $staff['late']->id, 'created_at' => '2026-08-30 10:00', 'resolved_at' => '2026-09-02 10:00', 'sla_resolve_due_at' => '2026-09-03 10:00']);

        return $staff;
    }

    public function test_departments_split_by_category_with_what_is_still_open(): void
    {
        $this->seedDeskSet();

        $rows = collect($this->summary($this->deskMember())['by_department']);

        // Busiest first; requesters with no department share one row.
        $this->assertSame(['IT', 'Sales', null], $rows->pluck('name')->all());
        $it = $rows->firstWhere('name', 'IT');
        $this->assertSame(4, $it['count']);
        // The reader has no network level, so that ticket is not counted anywhere.
        $this->assertSame(['hardware' => 3, 'software' => 1], $it['categories']);
        $this->assertSame(1, $it['open']);
        $this->assertSame(2, $it['sla_measured']);
        $this->assertSame(2, $it['sla_met']);
        $this->assertEquals(100.0, $it['sla_rate']);
        $this->assertEquals(0.0, $rows->firstWhere('name', 'Sales')['sla_rate']);
        $none = $rows->firstWhere('department_id', null);
        $this->assertSame(1, $none['count']);
        $this->assertSame(1, $none['open']);
    }

    public function test_departments_list_every_department_not_just_the_busiest(): void
    {
        foreach (range(1, 12) as $n) {
            $department = Department::create(['name' => "Dept {$n}"]);
            $requester = Employee::create(['first_name' => "E{$n}", 'status' => 'active', 'department_id' => $department->id]);
            $this->ticket(['requester_id' => $requester->id, 'created_at' => '2026-09-02 08:00']);
        }

        $this->assertCount(12, $this->summary($this->deskMember())['by_department']);
    }

    public function test_staff_count_only_what_they_closed_in_the_range(): void
    {
        $staff = $this->seedDeskSet();
        // Holds a live ticket and has closed nothing in the range — the card is about the period only.
        $busy = User::factory()->create(['name' => 'Busy']);
        $this->ticket(['status' => 'in_progress', 'assignee_id' => $busy->id, 'created_at' => '2026-09-10 10:00']);

        $rows = collect($this->summary($this->deskMember())['by_assignee']);

        // Most closed first; "Old timer" closed only in August, "Busy" closed nothing yet.
        $this->assertSame(['Kankanok', 'Latecomer', 'Somsak'], $rows->pluck('name')->all());
        $kan = $rows->firstWhere('assignee_id', $staff['kan']->id);
        $this->assertSame(3, $kan['total']);
        $this->assertSame(2, $kan['completed']);
        $this->assertSame(1, $kan['canceled']);
        // Mean of [24, 48] — the same measure as the KPI tile.
        $this->assertEquals(36.0, $kan['avg_resolve_hours']);
        $this->assertEquals(100.0, $kan['sla_rate']);
        // Nothing about what is in hand now.
        $this->assertArrayNotHasKey('in_hand', $kan);
        $this->assertArrayNotHasKey('breached_in_hand', $kan);
        // Opened in August, closed in September: counts by when it was closed.
        $this->assertSame(1, $rows->firstWhere('assignee_id', $staff['late']->id)['completed']);
        $som = $rows->firstWhere('assignee_id', $staff['som']->id);
        $this->assertEquals(192.0, $som['avg_resolve_hours']);
        $this->assertEquals(0.0, $som['sla_rate']);
    }

    public function test_staff_follow_the_category_filter(): void
    {
        $staff = $this->seedDeskSet();
        $user = $this->deskMember();

        // Kankanok's software ticket is still in progress, so nobody closed software in the range.
        $this->assertSame([], $this->summary($user, ['categories' => ['software']])['by_assignee']);

        $hardware = $this->summary($user, ['categories' => ['hardware']])['by_assignee'];
        $this->assertSame([$staff['kan']->id, $staff['late']->id, $staff['som']->id], array_column($hardware, 'assignee_id'));

        // A category outside the reader's levels shows nobody.
        $this->assertSame([], $this->summary($user, ['categories' => ['network']])['by_assignee']);
    }

    public function test_previous_period_is_the_same_length_right_before(): void
    {
        $user = $this->deskMember();
        $this->ticket(['created_at' => '2026-08-15 08:00']);
        $this->ticket(['status' => 'completed', 'created_at' => '2026-08-20 08:00', 'resolved_at' => '2026-08-20 12:00']);
        $this->ticket(['status' => 'completed', 'created_at' => '2026-08-21 08:00', 'resolved_at' => '2026-08-21 10:00']);

        $previous = $this->summary($user)['previous'];

        $this->assertSame('2026-08-02', $previous['from']);
        $this->assertSame('2026-08-31', $previous['to']);
        $this->assertSame(3, $previous['total']);
        // Mean of [2h, 4h].
        $this->assertEquals(3.0, $previous['avg_resolve_hours']);
    }

    public function test_rows_are_paginated_newest_first_with_sla_state(): void
    {
        $user = $this->deskMember();
        $met = $this->ticket(['status' => 'completed', 'created_at' => '2026-09-02 09:00',
            'resolved_at' => '2026-09-02 11:00', 'sla_resolve_due_at' => '2026-09-02 13:00']);
        $late = $this->ticket(['status' => 'in_progress', 'created_at' => '2026-09-10 09:00',
            'responded_at' => '2026-09-10 09:10', 'sla_resolve_due_at' => '2026-09-11 09:00']);

        $body = $this->actingAs($user)
            ->getJson('/api/reports/tickets/overview/rows?'.http_build_query([...self::RANGE, 'per_page' => 10]))
            ->assertOk()
            ->json();

        $this->assertSame(2, $body['meta']['total']);
        $this->assertSame($late->id, $body['data'][0]['id']);
        $this->assertSame('over_sla', $body['data'][0]['sla']);
        $this->assertNull($body['data'][0]['resolve_hours']);
        $this->assertSame('met', $body['data'][1]['sla']);
        $this->assertEquals(2.0, $body['data'][1]['resolve_hours']);
        $this->assertSame($met->ticket_no, $body['data'][1]['ticket_no']);
    }

    /** "ที่มา": tickets a person opened vs those an approved request opened — the page and its rows follow. */
    public function test_source_filter_narrows_the_page_and_its_rows(): void
    {
        $user = $this->deskMember();
        $mine = $this->ticket(['created_at' => '2026-09-05 09:00']);
        $auto = $this->ticket(['created_at' => '2026-09-06 09:00', 'source' => 'auto_request']);

        $this->assertSame(2, $this->summary($user)['kpi']['total']);
        $this->assertSame(1, $this->summary($user, ['source' => 'auto_request'])['kpi']['total']);
        $this->assertSame(1, $this->summary($user, ['source' => 'manual'])['kpi']['total']);

        $rows = fn (string $source) => $this->actingAs($user)
            ->getJson('/api/reports/tickets/overview/rows?'.http_build_query([...self::RANGE, 'source' => $source]))
            ->assertOk()->json('data');
        $this->assertSame([[$auto->id, 'auto_request']], array_map(fn (array $r) => [$r['id'], $r['source']], $rows('auto_request')));
        $this->assertSame([[$mine->id, 'manual']], array_map(fn (array $r) => [$r['id'], $r['source']], $rows('manual')));

        $this->actingAs($user)->getJson('/api/reports/tickets/overview?'.http_build_query([...self::RANGE, 'source' => 'request']))
            ->assertUnprocessable()->assertJsonValidationErrors(['source']);
    }

    public function test_rows_respect_the_same_access_rule(): void
    {
        Role::create(['key' => 'plain', 'name' => 'Plain', 'is_system' => false]);
        $user = User::factory()->create(['role' => 'plain']);

        $this->actingAs($user)->getJson('/api/reports/tickets/overview/rows?'.http_build_query(self::RANGE))->assertForbidden();
    }

    public function test_rows_carry_the_requesters_name_in_both_languages(): void
    {
        $user = $this->deskMember();
        $requester = Employee::create(['first_name' => 'Somchai', 'last_name' => 'Jaidee', 'first_name_th' => 'สมชาย', 'last_name_th' => 'ใจดี']);
        $this->ticket(['requester_id' => $requester->id, 'created_at' => '2026-09-05 09:00']);

        $row = $this->actingAs($user)
            ->getJson('/api/reports/tickets/overview/rows?'.http_build_query(self::RANGE))
            ->assertOk()->json('data.0');

        $this->assertSame('Somchai Jaidee', $row['requester_name']);
        $this->assertSame('สมชาย ใจดี', $row['requester_name_th']);
    }

    /** Every ticket report narrows by opening date, so that range has an index to use. */
    public function test_tickets_are_indexed_by_opening_date(): void
    {
        $this->assertTrue(Schema::hasIndex('tickets', ['created_at']));
    }
}
