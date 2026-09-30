<?php

namespace App\Services\Report\Ticket;

use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Services\Report\TicketMetrics;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "ผลงานเจ้าหน้าที่ IT" (Report Center → Tickets): one row per IT staff member (ticket assignee)
 * — what they closed in the date range (this month by default), how fast (median hours from
 * opening to resolution, the Ticket & SLA overview's own measure), how often inside SLA, and
 * what is in their hands right now. Most closed first.
 *
 * "Closed in the range" goes by resolved_at, so a ticket opened last month and finished this
 * month counts this month. Live counts are as of now, whatever the range.
 */
class StaffPerformanceReport extends TabularReport
{
    use TicketReportScope;

    public function key(): string
    {
        return 'tickets.staff_performance';
    }

    public function title(): string
    {
        return 'ผลงานเจ้าหน้าที่ IT';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfMonth()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('category', Options::fromLabels(self::categoryKeys())),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        [$from, $to] = $this->dayRange($filters);
        $inRange = 'tickets.resolved_at BETWEEN ? AND ?';
        $range = [$from, $to];

        return $this->scopedTickets($viewer, $filters['category'])
            ->join('users', 'users.id', '=', 'tickets.assignee_id')
            ->selectRaw('MIN(tickets.id) as id, tickets.assignee_id, users.name as assignee_name')
            ->selectRaw("SUM(CASE WHEN tickets.status = 'completed' AND {$inRange} THEN 1 ELSE 0 END) as completed_count", $range)
            ->selectRaw("SUM(CASE WHEN tickets.status = 'canceled' AND {$inRange} THEN 1 ELSE 0 END) as canceled_count", $range)
            ->selectRaw('SUM(CASE WHEN '.self::metSql()." AND {$inRange} THEN 1 ELSE 0 END) as sla_met", $range)
            ->selectRaw('SUM(CASE WHEN '.self::measuredSql()." AND {$inRange} THEN 1 ELSE 0 END) as sla_measured", $range)
            ->selectRaw("SUM(CASE WHEN tickets.status IN ('open', 'in_progress') THEN 1 ELSE 0 END) as in_hand")
            ->selectRaw('SUM(CASE WHEN '.self::breachedSql().' THEN 1 ELSE 0 END) as breached_in_hand')
            // Somebody with nothing closed in the range and nothing in hand has nothing to report.
            ->where(fn (Builder $q) => $q->whereBetween('tickets.resolved_at', $range)->orWhereIn('tickets.status', ['open', 'in_progress']))
            ->groupBy('tickets.assignee_id', 'users.name')
            ->orderByDesc('completed_count')
            ->orderBy('users.name');
    }

    public function columns(): array
    {
        $int = fn (string $alias) => fn (Ticket $t) => (int) $t->getAttribute($alias);

        return [
            ReportColumn::text('staff', 'เจ้าหน้าที่', fn (Ticket $t) => $t->getAttribute('assignee_name')),
            ReportColumn::number('completed_count', 'ปิดสำเร็จ', $int('completed_count')),
            ReportColumn::number('canceled_count', 'ยกเลิก', $int('canceled_count')),
            ReportColumn::number('median_resolve_hours', 'มัธยฐาน (ชม.)', fn (Ticket $t) => $t->getAttribute('median_resolve_hours')),
            ReportColumn::number('sla_rate', '% ตาม SLA', fn (Ticket $t) => self::percent((int) $t->getAttribute('sla_met'), (int) $t->getAttribute('sla_measured'))),
            ReportColumn::number('in_hand', 'อยู่ในมือตอนนี้', $int('in_hand')),
            ReportColumn::number('breached_in_hand', 'ในมือที่เกิน SLA', $int('breached_in_hand')),
        ];
    }

    /**
     * The median needs every resolve time, which a GROUP BY cannot give portably — so read
     * the completed tickets of the staff on this page in one query and work it out here.
     */
    public function hydrateRows(Collection $rows, User $viewer, array $filters): void
    {
        if ($rows->isEmpty()) {
            return;
        }

        [$from, $to] = $this->dayRange($filters);
        $hours = $this->scopedTickets($viewer, $filters['category'])
            ->whereIn('assignee_id', $rows->map(fn (Ticket $t) => $t->getAttribute('assignee_id'))->all())
            ->where('status', 'completed')
            ->whereBetween('resolved_at', [$from, $to])
            ->get(['id', 'assignee_id', 'created_at', 'resolved_at'])
            ->groupBy('assignee_id')
            ->map(fn (Collection $tickets) => $tickets->map(fn (Ticket $t) => TicketMetrics::resolveHours($t))->filter(fn ($h) => $h !== null)->sort()->values());

        foreach ($rows as $row) {
            $row->setAttribute('median_resolve_hours', TicketMetrics::percentile($hours->get($row->getAttribute('assignee_id'), collect()), 0.5));
        }
    }

    public function summary(Builder $query, array $filters): array
    {
        $rows = (clone $query)->get();
        $sum = fn (string $alias) => (int) $rows->sum(fn (Ticket $t) => (int) $t->getAttribute($alias));

        return [
            ReportSummary::make('total', 'เจ้าหน้าที่', $rows->count()),
            ReportSummary::make('completed', 'ปิดสำเร็จ', $sum('completed_count'), 'green'),
            ReportSummary::make('sla_rate', '% ตาม SLA', self::percent($sum('sla_met'), $sum('sla_measured'))),
            ReportSummary::make('in_hand', 'อยู่ในมือตอนนี้', $sum('in_hand'), 'amber'),
            ReportSummary::make('breached_in_hand', 'ในมือที่เกิน SLA', $sum('breached_in_hand'), 'red'),
        ];
    }
}
