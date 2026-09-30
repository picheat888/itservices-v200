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
 * The period (7 days / this month / quarter / year, up to today) moves the tiles that count
 * something over time — the SLA rate (with the change against the period before it) and
 * requests submitted. The others are states as of now.
 */
class ReportSnapshotService
{
    public const PERIODS = ['7d', 'month', 'quarter', 'year'];

    public function __construct(private TicketOverviewReportService $tickets) {}

    /**
     * @return array{period: string, from: string, to: string, tiles: list<array<string, mixed>>}
     */
    public function for(User $viewer, string $period): array
    {
        [$from, $to] = $this->range($period);
        $tiles = array_values(array_filter([
            $this->fromTabular($viewer, 'tickets_open', ReportCatalogue::TICKETS_BACKLOG, [], 'breached', 'breached'),
            $this->slaRate($viewer, $from, $to),
            $this->requestsPending($viewer, $from, $to),
            $this->assetsInUse($viewer),
            $this->fromTabular($viewer, 'contracts_expiring', ReportCatalogue::CONTRACTS_EXPIRING, ['within' => 30], 'overdue', 'overdue'),
            $this->fromTabular($viewer, 'stock_below_min', ReportCatalogue::STOCK_BELOW_MIN, [], 'out_of_stock', 'out'),
        ]));

        return ['period' => $period, 'from' => $from->toDateString(), 'to' => $to->toDateString(), 'tiles' => $tiles];
    }

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} */
    private function range(string $period): array
    {
        $today = CarbonImmutable::today();
        $from = match ($period) {
            '7d' => $today->subDays(6),
            'quarter' => $today->startOfQuarter(),
            'year' => $today->startOfYear(),
            default => $today->startOfMonth(),
        };

        return [$from->startOfDay(), $today->endOfDay()];
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

        return $this->tile('sla_rate', ReportCatalogue::TICKETS_OVERVIEW, $rate, unit: 'percent', delta: $rate !== null && $previous !== null ? round($rate - $previous, 1) : null);
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
    private function tile(string $key, string $reportKey, int|float|null $value, ?int $total = null, ?string $unit = null, ?float $delta = null, ?array $secondary = null): array
    {
        return [
            'key' => $key,
            'report_key' => $reportKey,
            'value' => $value,
            'total' => $total,
            'unit' => $unit,
            'delta' => $delta,
            'secondary' => $secondary,
        ];
    }
}
