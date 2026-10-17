<?php

namespace App\Services\Dashboard;

use App\Enums\Request\RequestStatus;
use App\Models\Request\RequestApproval;
use App\Models\Request\ServiceRequest;
use App\Services\Request\RequestStalledService;
use Carbon\Carbon;
use Carbon\CarbonInterface;

/**
 * The Dashboard's Requests section and the "waiting for the IT team" tile.
 */
class RequestsBlock
{
    private const LIST_LIMIT = 5;

    private const SERIES_DAYS = 14;

    private const WINDOW_DAYS = 30;

    public function __construct(private readonly RequestStalledService $stalled) {}

    /**
     * @return array<string, mixed>
     */
    public function build(): array
    {
        $now = now();
        $since = $now->copy()->subDays(self::WINDOW_DAYS);
        $filed = DailySeries::values(DailySeries::count(ServiceRequest::query(), 'created_at', self::SERIES_DAYS));
        $approved = ServiceRequest::where('status', RequestStatus::Approved->value)->get(['id', 'created_at', 'approved_at']);
        $ages = $approved->countBy(fn (ServiceRequest $r) => $this->ageBucket($r->approved_at ?? $r->created_at, $now));
        $pending = ServiceRequest::where('status', RequestStatus::Pending->value);
        // Filed in the window and now in that state, so each figure is the Requests list under filed_days=30
        $completed = ServiceRequest::where('status', RequestStatus::Completed->value)
            ->where('created_at', '>=', $since)
            ->get(['id', 'created_at', 'completed_at']);
        $waiting = $this->stalled->waitingSteps();

        return [
            'awaiting_it' => [
                'count' => $approved->count(),
                'le7' => (int) ($ages['le7'] ?? 0),
                'd8_14' => (int) ($ages['d8_14'] ?? 0),
                'gt14' => (int) ($ages['gt14'] ?? 0),
            ],
            'filed' => ['total' => array_sum($filed), 'peak' => max($filed), 'series' => $filed],
            'pending' => [
                'count' => (clone $pending)->count(),
                'oldest_days' => $this->daysSince((clone $pending)->min('created_at'), $now),
            ],
            'filed_30d' => ServiceRequest::where('created_at', '>=', $since)->count(),
            'completed_30d' => $completed->count(),
            'rejected_30d' => ServiceRequest::where('status', RequestStatus::Rejected->value)->where('created_at', '>=', $since)->count(),
            'cancelled_30d' => ServiceRequest::where('status', RequestStatus::Cancelled->value)->where('created_at', '>=', $since)->count(),
            'avg_days_to_complete' => $completed->isEmpty()
                ? null
                : round((float) $completed->avg(fn (ServiceRequest $r) => $r->created_at->diffInMinutes($r->completed_at, true) / 1440), 1),
            // The stalled-reminder set, so this list is the morning bells, not a second definition of slow.
            'waiting_after_days' => $this->stalled->waitingAfterDays(),
            'waiting_total' => $waiting->count(),
            'waiting' => $waiting->take(self::LIST_LIMIT)
                ->map(fn (RequestApproval $step) => [
                    'id' => $step->request->id,
                    'reference' => $step->request->reference,
                    'title' => $step->request->title,
                    'waiting_on' => $step->approver_name ?: $step->label,
                    'days' => $this->stalled->daysWaiting($step),
                ])->values()->all(),
            'by_type' => ServiceRequest::query()
                ->toBase()
                ->where('created_at', '>=', $since)
                ->selectRaw('type, COUNT(*) as total')
                ->groupBy('type')
                ->orderByDesc('total')
                ->get()
                ->map(fn (object $row) => ['type' => (string) $row->type, 'count' => (int) $row->total])
                ->all(),
        ];
    }

    private function ageBucket(CarbonInterface $at, CarbonInterface $now): string
    {
        $days = (int) $at->diffInDays($now);

        return match (true) {
            $days <= 7 => 'le7',
            $days <= 14 => 'd8_14',
            default => 'gt14',
        };
    }

    private function daysSince(?string $at, CarbonInterface $now): int
    {
        return $at === null ? 0 : (int) Carbon::parse($at)->diffInDays($now);
    }
}
