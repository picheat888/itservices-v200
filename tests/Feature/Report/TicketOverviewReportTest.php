<?php

namespace Tests\Feature\Report;

use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
        // Nearest-rank median of [2, 10] is 2; P90 is 10.
        $this->assertEquals(2.0, $kpi['median_resolve_hours']);
        $this->assertEquals(10.0, $kpi['p90_resolve_hours']);
    }

    public function test_an_empty_range_reports_null_rates_not_zero(): void
    {
        $kpi = $this->summary($this->deskMember())['kpi'];

        $this->assertSame(0, $kpi['total']);
        $this->assertNull($kpi['sla_rate']);
        $this->assertNull($kpi['median_resolve_hours']);
    }

    public function test_categories_outside_the_viewers_levels_are_invisible(): void
    {
        $user = $this->deskMember(['hardware']);
        $this->ticket(['category' => 'hardware', 'created_at' => '2026-09-05 08:00']);
        $this->ticket(['category' => 'network', 'created_at' => '2026-09-05 08:00']);

        $this->assertSame(1, $this->summary($user)['kpi']['total']);
        // Asking for a category you cannot see does not widen the scope.
        $this->assertSame(0, $this->summary($user, ['categories' => ['network']])['kpi']['total']);
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
        $this->assertSame(1, $backlog['breached']);
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
        $this->assertEquals(['assignee_id' => $tech->id, 'name' => 'Tech One', 'completed' => 1, 'median_resolve_hours' => 1.0], $data['by_assignee'][0]);
    }

    public function test_previous_period_is_the_same_length_right_before(): void
    {
        $user = $this->deskMember();
        $this->ticket(['created_at' => '2026-08-15 08:00']);

        $previous = $this->summary($user)['previous'];

        $this->assertSame('2026-08-02', $previous['from']);
        $this->assertSame('2026-08-31', $previous['to']);
        $this->assertSame(1, $previous['total']);
    }
}
