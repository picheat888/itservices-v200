<?php

namespace App\Services\Dashboard;

use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Report\TicketMetrics;
use App\Services\Report\TicketOverviewReportService;
use App\Support\TicketSla;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * The Dashboard's IT section: the live queue, two weeks of flow, and the overview report's SLA figures.
 */
class ItBlock
{
    private const SERIES_DAYS = 14;

    private const WINDOW_DAYS = 30;

    public function __construct(private readonly TicketOverviewReportService $overview) {}

    /**
     * @return array<string, mixed>
     */
    public function build(): array
    {
        $now = now();
        $live = Ticket::whereIn('status', TicketStatus::liveValues())
            ->get(['id', 'status', 'assignee_id', 'created_at', 'responded_at', 'sla_response_due_at', 'sla_resolve_due_at']);
        $open = $live->filter(fn (Ticket $t) => $t->status === TicketStatus::Open);
        $inProgress = $live->filter(fn (Ticket $t) => $t->status === TicketStatus::InProgress);

        $opened = DailySeries::count(Ticket::query(), 'created_at', self::SERIES_DAYS);
        $closed = DailySeries::values(DailySeries::count(Ticket::where('status', TicketStatus::Completed->value), 'resolved_at', self::SERIES_DAYS));
        [$openingLevel, $backlog] = $this->backlogSeries(DailySeries::values($opened));

        $to = CarbonImmutable::now()->endOfDay();
        $from = $to->subDays(self::WINDOW_DAYS - 1)->startOfDay();
        $kpis = $this->overview->kpisForAll($from, $to);

        return [
            'waiting' => ['count' => $open->count(), 'oldest_days' => $this->daysSince($open->min('created_at'), $now)],
            'backlog' => [
                'open' => $open->count(),
                'in_progress' => $inProgress->count(),
                'over_sla' => $live->filter(fn (Ticket $t) => TicketMetrics::liveSlaState($t, $now) === 'over_sla')->count(),
                'delta_14d' => $backlog[count($backlog) - 1] - $openingLevel,
                'series' => $backlog,
            ],
            'opened' => $this->figure(DailySeries::values($opened)),
            'closed' => $this->figure($closed),
            // from/to: the window, so the tiles can open the overview report on the same days.
            'sla' => [
                'rate' => $kpis['sla_rate'],
                'measured' => $kpis['sla_measured'],
                'goal' => TicketSla::goalPercent(),
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
            ],
            'avg_resolve_hours' => $kpis['avg_resolve_hours'],
            'volume' => $opened,
            'unassigned' => $open->count(),
            'workload' => $this->workload($inProgress),
        ];
    }

    /**
     * @param  list<int>  $series
     * @return array{total: int, peak: int, series: list<int>}
     */
    private function figure(array $series): array
    {
        return ['total' => array_sum($series), 'peak' => max($series), 'series' => $series];
    }

    /**
     * The level before the window opened, and what was still open at the end of each day after it.
     *
     * @param  list<int>  $opened
     * @return array{0: int, 1: list<int>}
     */
    private function backlogSeries(array $opened): array
    {
        $start = now()->startOfDay()->subDays(self::SERIES_DAYS - 1);
        $resolved = DailySeries::values(DailySeries::count(Ticket::whereNotNull('resolved_at'), 'resolved_at', self::SERIES_DAYS));
        $level = Ticket::where('created_at', '<', $start)
            ->where(fn ($q) => $q->whereNull('resolved_at')->orWhere('resolved_at', '>=', $start))
            ->count();

        $opening = $level;
        $series = [];
        foreach ($opened as $i => $arrived) {
            $level += $arrived - $resolved[$i];
            $series[] = max(0, $level);
        }

        return [$opening, $series];
    }

    /**
     * @param  Collection<int, Ticket>  $inProgress
     * @return list<array{assignee_id: int, name: ?string, open: int}>
     */
    private function workload(Collection $inProgress): array
    {
        $counts = $inProgress->whereNotNull('assignee_id')->countBy('assignee_id');
        $names = User::whereIn('id', $counts->keys()->all())->pluck('name', 'id');

        return $counts
            ->map(fn (int $open, int|string $id) => ['assignee_id' => (int) $id, 'name' => $names[$id] ?? null, 'open' => $open])
            ->sortByDesc('open')
            ->values()
            ->all();
    }

    private function daysSince(?CarbonInterface $at, CarbonInterface $now): int
    {
        return $at === null ? 0 : (int) $at->diffInDays($now);
    }
}
