<?php

namespace Tests\Feature\Report;

use App\Models\Ticket\Ticket;
use App\Services\Dashboard\DailySeries;
use App\Services\Report\TicketMetrics;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The backlog report's SLA segments, shared with the Dashboard, and the daily counter. */
class TicketLiveSlaStateTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_live_case_is_judged_by_the_deadline_it_runs_on_now(): void
    {
        $this->freezeTime();
        $now = now();

        // Waiting to be taken: the response deadline counts.
        $waiting = Ticket::factory()->make(['status' => 'open', 'responded_at' => null, 'sla_response_due_at' => $now->copy()->subHour(), 'sla_resolve_due_at' => $now->copy()->addDays(3)]);
        $soon = Ticket::factory()->make(['status' => 'in_progress', 'responded_at' => $now, 'sla_resolve_due_at' => $now->copy()->addHours(24)]);
        $later = Ticket::factory()->make(['status' => 'in_progress', 'responded_at' => $now, 'sla_resolve_due_at' => $now->copy()->addHours(25)]);
        $none = Ticket::factory()->make(['status' => 'in_progress', 'responded_at' => $now, 'sla_resolve_due_at' => null]);

        $this->assertSame('over_sla', TicketMetrics::liveSlaState($waiting, $now));
        $this->assertSame('due_soon', TicketMetrics::liveSlaState($soon, $now));
        $this->assertSame('on_track', TicketMetrics::liveSlaState($later, $now));
        $this->assertSame('no_due', TicketMetrics::liveSlaState($none, $now));
    }

    public function test_the_daily_series_has_one_point_per_day_with_today_last(): void
    {
        $this->freezeTime();
        Ticket::factory()->create(['created_at' => now()->subDays(2)]);
        Ticket::factory()->create(['created_at' => now()->subDays(2)]);
        Ticket::factory()->create(['created_at' => now()]);
        Ticket::factory()->create(['created_at' => now()->subDays(20)]);

        $series = DailySeries::count(Ticket::query(), 'created_at', 14);

        $this->assertCount(14, $series);
        $this->assertSame(['date' => now()->subDays(13)->toDateString(), 'count' => 0], $series[0]);
        $this->assertSame(['date' => now()->subDays(2)->toDateString(), 'count' => 2], $series[11]);
        $this->assertSame(['date' => now()->toDateString(), 'count' => 1], $series[13]);
        $this->assertSame(3, array_sum(DailySeries::values($series)));
    }
}
