<?php

// Pins the list's meta.period figures (counts by status in the period, mean days to a decision).

namespace Tests\Feature;

use App\Models\Request\ServiceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RequestPeriodStatsTest extends TestCase
{
    use RefreshDatabase;

    private function filed(string $status, string $filedAt, ?string $approvedAt = null, ?string $rejectedAt = null): void
    {
        $request = ServiceRequest::create([
            'type' => 'cctv', 'requester_name' => 'R', 'title' => 'T', 'reason' => 'r', 'status' => $status,
            'approved_at' => $approvedAt, 'rejected_at' => $rejectedAt,
        ]);
        $request->forceFill(['created_at' => $filedAt, 'updated_at' => $filedAt])->save();
    }

    public function test_period_meta_counts_statuses_and_averages_the_decision_time(): void
    {
        $this->filed('pending', '2026-01-01 08:00:00');
        $this->filed('approved', '2026-01-01 08:00:00', approvedAt: '2026-01-02 08:00:00');
        $this->filed('rejected', '2026-01-01 08:00:00', rejectedAt: '2026-01-04 08:00:00');
        $this->filed('completed', '2026-01-01 08:00:00', approvedAt: '2026-01-01 20:00:00');
        $this->filed('cancelled', '2026-01-01 08:00:00');
        $this->filed('approved', '2026-01-01 08:00:00');

        $period = $this->actingAs(User::factory()->create(['role' => 'super']))
            ->getJson('/api/service-requests')->assertOk()->json('meta.period');

        // (1 + 3 + 0.5) days over the three decided requests that carry a decision time.
        $this->assertSame(
            ['pending' => 1, 'approved' => 2, 'rejected' => 1, 'completed' => 1, 'cancelled' => 1, 'avg_cycle_days' => 1.5],
            $period,
        );
    }

    public function test_period_meta_has_no_average_without_a_decision(): void
    {
        $this->filed('pending', '2026-01-01 08:00:00');

        $this->actingAs(User::factory()->create(['role' => 'super']))
            ->getJson('/api/service-requests')->assertOk()
            ->assertJsonPath('meta.period.avg_cycle_days', null)
            ->assertJsonPath('meta.period.pending', 1);
    }
}
