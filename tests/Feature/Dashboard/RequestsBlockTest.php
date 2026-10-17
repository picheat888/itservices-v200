<?php

namespace Tests\Feature\Dashboard;

use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Services\Dashboard\RequestsBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The Requests section and the "waiting for the IT team" tile. */
class RequestsBlockTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
    }

    private function block(): array
    {
        return app(RequestsBlock::class)->build();
    }

    /** @param array<string, mixed> $stamps timestamps written after create (not fillable) */
    private function request(string $reference, string $status, string $type = 'computer', array $stamps = []): ServiceRequest
    {
        $request = ServiceRequest::create([
            'reference' => $reference, 'type' => $type, 'origin' => 'direct',
            'requester_name' => 'Somchai', 'title' => "Request {$reference}",
            'reason' => 'Needed for work.', 'status' => $status,
        ]);
        if ($stamps !== []) {
            $request->forceFill($stamps)->save();
        }

        return $request;
    }

    /** Exactly 7 days is still "up to 7"; exactly 14 is still "8 to 14". */
    public function test_awaiting_it_splits_approved_requests_by_days_since_approval(): void
    {
        $this->request('RQ-2026-0001', 'approved', stamps: ['approved_at' => now()->subDays(2)]);
        $this->request('RQ-2026-0002', 'approved', stamps: ['approved_at' => now()->subDays(7)]);
        $this->request('RQ-2026-0003', 'approved', stamps: ['approved_at' => now()->subDays(14)]);
        $this->request('RQ-2026-0004', 'approved', stamps: ['approved_at' => now()->subDays(15)]);
        $this->request('RQ-2026-0005', 'pending');

        $this->assertSame(['count' => 4, 'le7' => 2, 'd8_14' => 1, 'gt14' => 1], $this->block()['awaiting_it']);
    }

    public function test_window_counts_and_the_average_days_to_complete(): void
    {
        $this->request('RQ-2026-0011', 'completed', stamps: ['created_at' => now()->subDays(6), 'completed_at' => now()->subDays(2)]);
        $this->request('RQ-2026-0012', 'completed', stamps: ['created_at' => now()->subDays(10), 'completed_at' => now()->subDays(8)]);
        $this->request('RQ-2026-0013', 'completed', stamps: ['created_at' => now()->subDays(70), 'completed_at' => now()->subDays(40)]);
        $this->request('RQ-2026-0014', 'rejected', stamps: ['rejected_at' => now()->subDays(3)]);
        $this->request('RQ-2026-0015', 'cancelled', stamps: ['cancelled_at' => now()->subDay()]);
        $this->request('RQ-2026-0016', 'pending', stamps: ['created_at' => now()->subDays(5)]);
        // Filed before the window: left out though it ended inside it
        $this->request('RQ-2026-0017', 'completed', stamps: ['created_at' => now()->subDays(40), 'completed_at' => now()->subDays(3)]);
        $this->request('RQ-2026-0018', 'rejected', stamps: ['created_at' => now()->subDays(35), 'rejected_at' => now()->subDays(2)]);

        $block = $this->block();

        $this->assertSame(2, $block['completed_30d']);
        $this->assertSame(1, $block['rejected_30d']);
        $this->assertSame(1, $block['cancelled_30d']);
        $this->assertSame(3.0, $block['avg_days_to_complete']);
        $this->assertSame(['count' => 1, 'oldest_days' => 5], $block['pending']);
        $this->assertSame(5, $block['filed_30d']);
        $this->assertSame(5, $block['filed']['total']);
        $this->assertSame(2, $block['filed']['peak']);
    }

    public function test_steps_past_the_stalled_threshold_are_listed_longest_first(): void
    {
        $step = fn (ServiceRequest $request, string $name, int $daysAgo) => RequestApproval::create([
            'service_request_id' => $request->id, 'position' => 1, 'actor_type' => 'chain', 'kind' => 'approval',
            'label' => 'Manager', 'approver_name' => $name, 'status' => 'current', 'became_current_at' => now()->subDays($daysAgo),
        ]);
        $step($this->request('RQ-2026-0101', 'pending'), 'Manee', 5);
        $step($this->request('RQ-2026-0102', 'pending', 'mobile'), 'Somsak', 9);
        $step($this->request('RQ-2026-0103', 'pending', 'email'), 'Fresh', 1);

        $block = $this->block();

        $this->assertSame(3, $block['waiting_after_days']);
        $this->assertSame(2, $block['waiting_total']);
        $this->assertSame(['RQ-2026-0102', 'RQ-2026-0101'], array_column($block['waiting'], 'reference'));
        $this->assertSame('Somsak', $block['waiting'][0]['waiting_on']);
        // A step with no employee record has no Thai name to offer
        $this->assertNull($block['waiting'][0]['waiting_on_th']);
        $this->assertSame(9, $block['waiting'][0]['days']);
    }

    public function test_by_type_counts_the_window_busiest_first(): void
    {
        $this->request('RQ-2026-0201', 'pending');
        $this->request('RQ-2026-0202', 'approved');
        $this->request('RQ-2026-0203', 'rejected', 'email');
        $this->request('RQ-2026-0204', 'completed', 'email', ['created_at' => now()->subDays(60)]);

        $this->assertSame([['type' => 'computer', 'count' => 2], ['type' => 'email', 'count' => 1]], $this->block()['by_type']);
    }
}
