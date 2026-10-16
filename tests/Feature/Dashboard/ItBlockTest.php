<?php

namespace Tests\Feature\Dashboard;

use App\Models\Permission\Role;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Dashboard\ItBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The IT section: the live queue, two weeks of flow, and the overview report's SLA figures. */
class ItBlockTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
    }

    private function it(): array
    {
        return app(ItBlock::class)->build();
    }

    public function test_the_live_queue_counts_open_cases_flags_past_sla_and_names_who_holds_what(): void
    {
        $tech = User::factory()->create();
        Ticket::factory()->create(['status' => 'open', 'assignee_id' => null, 'created_at' => now()->subDays(3), 'sla_response_due_at' => now()->subHour()]);
        Ticket::factory()->create(['status' => 'open', 'assignee_id' => null, 'created_at' => now()->subDay()]);
        Ticket::factory()->create(['status' => 'in_progress', 'assignee_id' => $tech->id, 'responded_at' => now(), 'sla_resolve_due_at' => now()->addDay()]);
        Ticket::factory()->create(['status' => 'completed', 'assignee_id' => $tech->id, 'resolved_at' => now()]);

        $it = $this->it();

        $this->assertSame(['count' => 2, 'oldest_days' => 3], $it['waiting']);
        $this->assertSame(2, $it['backlog']['open']);
        $this->assertSame(1, $it['backlog']['in_progress']);
        $this->assertSame(1, $it['backlog']['over_sla']);
        $this->assertSame(2, $it['unassigned']);
        $this->assertSame([['assignee_id' => $tech->id, 'name' => $tech->name, 'open' => 1]], $it['workload']);
    }

    public function test_the_fourteen_day_series_count_arrivals_closures_and_the_backlog_level(): void
    {
        Ticket::factory()->create(['status' => 'open', 'created_at' => now()->subDays(30)]);
        Ticket::factory()->create(['status' => 'completed', 'created_at' => now()->subDays(30), 'resolved_at' => now()->subDays(3)]);
        Ticket::factory()->create(['status' => 'completed', 'created_at' => now()->subDays(5), 'resolved_at' => now()->subDays(5)]);
        // Canceled: leaves the backlog, but is not a closure.
        Ticket::factory()->create(['status' => 'canceled', 'created_at' => now()->subDays(2), 'resolved_at' => now()->subDays(2)]);

        $it = $this->it();

        $this->assertCount(14, $it['volume']);
        $this->assertSame(now()->subDays(13)->toDateString(), $it['volume'][0]['date']);
        $this->assertSame(now()->toDateString(), $it['volume'][13]['date']);
        $this->assertSame(2, $it['opened']['total']);
        $this->assertSame(1, $it['opened']['peak']);
        $this->assertSame(2, $it['closed']['total']);
        $this->assertSame(2, $it['backlog']['series'][0]);
        $this->assertSame(1, $it['backlog']['series'][13]);
        $this->assertSame(-1, $it['backlog']['delta_14d']);
    }

    public function test_sla_rate_and_resolve_time_match_the_ticket_overview_report(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $super = User::factory()->create(['role' => 'super']);
        $closed = fn (int $daysAgo, int $hours, bool $late) => Ticket::factory()->create([
            'status' => 'completed',
            'created_at' => now()->subDays($daysAgo),
            'resolved_at' => now()->subDays($daysAgo)->addHours($hours),
            'sla_resolve_due_at' => now()->subDays($daysAgo)->addHours($late ? $hours - 1 : $hours + 1),
        ]);
        $closed(2, 4, false);
        $closed(10, 30, true);
        $closed(20, 8, false);
        $closed(40, 2, false);

        $report = $this->actingAs($super)->getJson('/api/reports/tickets/overview?'.http_build_query([
            'from' => now()->subDays(29)->toDateString(), 'to' => now()->toDateString(),
        ]))->assertOk()->json('data.kpi');
        $it = $this->it();

        $this->assertEquals($report['sla_rate'], $it['sla']['rate']);
        $this->assertEquals($report['avg_resolve_hours'], $it['avg_resolve_hours']);
        $this->assertSame(66.7, $it['sla']['rate']);
        $this->assertSame(3, $it['sla']['measured']);
        $this->assertSame(14.0, $it['avg_resolve_hours']);
    }

    public function test_an_empty_desk_returns_zeros_and_nulls_not_errors(): void
    {
        $it = $this->it();

        $this->assertSame(['count' => 0, 'oldest_days' => 0], $it['waiting']);
        $this->assertSame(0, $it['opened']['peak']);
        $this->assertSame(0, $it['backlog']['delta_14d']);
        $this->assertNull($it['sla']['rate']);
        $this->assertNull($it['avg_resolve_hours']);
        $this->assertSame([], $it['workload']);
    }
}
