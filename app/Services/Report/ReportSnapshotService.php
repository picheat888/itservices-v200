<?php

namespace App\Services\Report;

use App\Models\Asset\Asset;
use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Services\Report\Tabular\ReportSummary;
use App\Support\ReportCatalogue;
use Carbon\CarbonImmutable;

/**
 * The number strip on top of the Report Center (/reports) — one endpoint for every tile.
 *
 * A tile shows only when the reader may open the report it links to, and takes its number
 * from that report (its own query and summary, or the Ticket & SLA overview's own summary),
 * so clicking a tile never lands on a page that says something else.
 *
 * The period — the last 7, 30 or 90 days up to today, or a range the reader picks — moves the
 * tiles that count something over time — the SLA rate (with the change against the period before it) and
 * requests submitted. The others are states as of now.
 */
class ReportSnapshotService
{
    public const PERIODS = ['7d', '30d', '90d', 'custom'];

    /** Days each preset period looks back over, today included. */
    private const PRESET_DAYS = ['7d' => 7, '30d' => 30, '90d' => 90];

    /** Points on a tile's trend line (the mockup's sparklines). */
    public const TREND_POINTS = 7;

    /** The Ticket & SLA report's filters with nothing narrowed — the viewer's levels only. */
    private const NO_TICKET_FILTERS = ['categories' => [], 'priority' => null, 'department_id' => null, 'assignee_id' => null];

    public function __construct(private TicketOverviewReportService $tickets) {}

    /**
     * @param  ?string  $customFrom  "YYYY-MM-DD" — the custom period only (validated by the caller)
     * @param  ?string  $customTo  "YYYY-MM-DD" — the custom period only
     * @return array{period: string, from: string, to: string, tiles: list<array<string, mixed>>}
     */
    public function for(User $viewer, string $period, ?string $customFrom = null, ?string $customTo = null): array
    {
        [$from, $to] = $this->range($period, $customFrom, $customTo);
        $tiles = array_values(array_filter([
            $this->ticketsOpen($viewer, $from, $to),
            $this->slaRate($viewer, $from, $to),
            $this->requestsPending($viewer, $from, $to),
            $this->assetsInUse($viewer),
            $this->fromTabular($viewer, 'contracts_expiring', ReportCatalogue::CONTRACTS_EXPIRING, ['within' => 30], 'overdue', 'overdue'),
            $this->fromTabular($viewer, 'stock_below_min', ReportCatalogue::STOCK_BELOW_MIN, [], 'out_of_stock', 'out'),
        ]));

        return ['period' => $period, 'from' => $from->toDateString(), 'to' => $to->toDateString(), 'tiles' => $tiles];
    }

    /**
     * A preset counts back from today (7 days = today and the six before it); custom is the
     * reader's own from / to.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    private function range(string $period, ?string $customFrom, ?string $customTo): array
    {
        if ($period === 'custom' && $customFrom !== null && $customTo !== null) {
            return [CarbonImmutable::parse($customFrom)->startOfDay(), CarbonImmutable::parse($customTo)->endOfDay()];
        }

        $today = CarbonImmutable::today();
        $days = self::PRESET_DAYS[$period] ?? self::PRESET_DAYS['30d'];

        return [$today->subDays($days - 1)->startOfDay(), $today->endOfDay()];
    }

    /** @return array<string, mixed>|null */
    private function slaRate(User $viewer, CarbonImmutable $from, CarbonImmutable $to): ?array
    {
        if (! ReportCatalogue::allows($viewer, ReportCatalogue::TICKETS_OVERVIEW)) {
            return null;
        }

        $summary = $this->tickets->summary($viewer, [
            'from' => $from, 'to' => $to, 'categories' => [], 'priority' => null, 'department_id' => null, 'assignee_id' => null,
        ]);
        $rate = $summary['kpi']['sla_rate'];
        $previous = $summary['previous']['sla_rate'];

        return $this->tile(
            'sla_rate',
            ReportCatalogue::TICKETS_OVERVIEW,
            $rate,
            unit: 'percent',
            delta: $rate !== null && $previous !== null ? round($rate - $previous, 1) : null,
            trend: $this->slaTrend($viewer, $from, $to),
        );
    }

    /**
     * Tickets still open now (the backlog report's own number and "past SLA" line), with how
     * the open count moved across the period: the change since its start and a
     * TREND_POINTS-point line. A ticket was open at a moment when it had been raised and not
     * yet closed then (resolved_at is stamped on complete and on cancel alike).
     *
     * @return array<string, mixed>|null
     */
    private function ticketsOpen(User $viewer, CarbonImmutable $from, CarbonImmutable $to): ?array
    {
        $tile = $this->fromTabular($viewer, 'tickets_open', ReportCatalogue::TICKETS_BACKLOG, [], 'over_sla', 'over_sla');
        if ($tile === null) {
            return null;
        }

        $tickets = $this->tickets->scoped($viewer, self::NO_TICKET_FILTERS)
            ->where('created_at', '<=', $to)
            ->where(fn ($q) => $q->whereNull('resolved_at')->orWhere('resolved_at', '>', $from))
            ->get(['created_at', 'resolved_at']);

        $openAt = fn (CarbonImmutable $moment) => $tickets
            ->filter(fn ($t) => $t->created_at <= $moment && ($t->resolved_at === null || $t->resolved_at > $moment))
            ->count();
        // Up to now, not the end of today: the last point is the live count the tile shows.
        $trend = array_map($openAt, $this->trendMoments($from, $to->min(CarbonImmutable::now())));

        $tile['trend'] = $trend;
        $tile['delta'] = (float) ($trend[count($trend) - 1] - $trend[0]);

        return $tile;
    }

    /**
     * The SLA rate of the tickets opened in each slice of the period — the same rule as the
     * Ticket & SLA report (completed, resolved on or before the resolve deadline). A slice with
     * nothing measured is null, which the line skips.
     *
     * @return list<float|null>
     */
    private function slaTrend(User $viewer, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $completed = $this->tickets->scoped($viewer, self::NO_TICKET_FILTERS)
            ->whereBetween('created_at', [$from, $to])
            ->where('status', 'completed')
            ->whereNotNull('resolved_at')
            ->whereNotNull('sla_resolve_due_at')
            ->get(['created_at', 'resolved_at', 'sla_resolve_due_at']);

        // TREND_POINTS equal slices of the period: slice i runs from one boundary to the next.
        $span = max(1, $to->getTimestamp() - $from->getTimestamp());
        $boundary = fn (int $i) => $from->getTimestamp() + $span * $i / self::TREND_POINTS;
        $rates = [];
        for ($i = 0; $i < self::TREND_POINTS; $i++) {
            $slice = $completed->filter(fn ($t) => $t->created_at->getTimestamp() >= $boundary($i) && $t->created_at->getTimestamp() < $boundary($i + 1));
            $met = $slice->filter(fn ($t) => $t->resolved_at->lte($t->sla_resolve_due_at))->count();
            $rates[] = $slice->isEmpty() ? null : round($met / $slice->count() * 100, 1);
        }

        return $rates;
    }

    /**
     * TREND_POINTS evenly spaced moments across [from, to] — the first at `from`, the last at `to`.
     *
     * @return list<CarbonImmutable>
     */
    private function trendMoments(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $span = max(1, $to->getTimestamp() - $from->getTimestamp());
        $moments = [];
        for ($i = 0; $i < self::TREND_POINTS; $i++) {
            $moments[] = $from->addSeconds((int) round($span * $i / (self::TREND_POINTS - 1)));
        }

        return $moments;
    }

    /** @return array<string, mixed>|null */
    private function requestsPending(User $viewer, CarbonImmutable $from, CarbonImmutable $to): ?array
    {
        if (! ReportCatalogue::allows($viewer, ReportCatalogue::REQUESTS_SUMMARY)) {
            return null;
        }

        return $this->tile(
            'requests_pending',
            ReportCatalogue::REQUESTS_SUMMARY,
            ServiceRequest::query()->where('status', 'pending')->count(),
            secondary: ['key' => 'submitted', 'value' => ServiceRequest::query()->whereBetween('created_at', [$from, $to])->count()],
        );
    }

    /**
     * In use (deployed + common) out of everything not written off.
     *
     * @return array<string, mixed>|null
     */
    private function assetsInUse(User $viewer): ?array
    {
        if (! ReportCatalogue::allows($viewer, ReportCatalogue::ASSETS_BY_STATUS_DEPARTMENT)) {
            return null;
        }

        $total = Asset::query()->where('status', '!=', 'writeoff')->count();
        $inUse = Asset::query()->whereIn('status', ['deployed', 'common'])->count();

        return $this->tile(
            'assets_in_use',
            ReportCatalogue::ASSETS_BY_STATUS_DEPARTMENT,
            $inUse,
            total: $total,
            secondary: ['key' => 'rate', 'value' => $total > 0 ? (int) round($inUse / $total * 100) : null],
        );
    }

    /**
     * A tile read straight off a tabular report's own summary: its `total`, plus one more of
     * its summary numbers as the tile's second line.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>|null
     */
    private function fromTabular(User $viewer, string $tileKey, string $reportKey, array $filters, string $summaryKey, string $secondaryKey): ?array
    {
        if (! ReportCatalogue::allows($viewer, $reportKey)) {
            return null;
        }

        $report = ReportCatalogue::tabular($reportKey);
        $resolved = $report->resolveFilters($filters);
        $summary = collect($report->summary($report->query($viewer, $resolved), $resolved))->keyBy('key');
        $value = fn (string $key) => $summary->get($key) instanceof ReportSummary ? $summary->get($key)->value : null;

        return $this->tile($tileKey, $reportKey, $value('total'), secondary: ['key' => $secondaryKey, 'value' => $value($summaryKey)]);
    }

    /**
     * @param  array{key: string, value: int|float|null}|null  $secondary
     * @return array<string, mixed>
     */
    private function tile(string $key, string $reportKey, int|float|null $value, ?int $total = null, ?string $unit = null, ?float $delta = null, ?array $secondary = null, ?array $trend = null): array
    {
        return [
            'key' => $key,
            'report_key' => $reportKey,
            'value' => $value,
            'total' => $total,
            'unit' => $unit,
            'delta' => $delta,
            'secondary' => $secondary,
            // A short line of the value across the period (sparkline), where the history exists.
            'trend' => $trend,
        ];
    }
}
