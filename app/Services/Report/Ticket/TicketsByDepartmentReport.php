<?php

namespace App\Services\Report\Ticket;

use App\Enums\Ticket\TicketCategory;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;

/**
 * "Ticket ตามแผนกและหมวด" (Report Center → Tickets): one row per requester department with the
 * tickets it opened in the date range (this month by default) split by category, how many are
 * still open, and its SLA hit rate. Busiest department first; requesters with no department
 * share one row.
 *
 * A category the reader has no `tickets.level_*` for is not counted anywhere and its column
 * reads "—" (null), never 0 — zero would claim there were none.
 */
class TicketsByDepartmentReport extends TabularReport
{
    use TicketReportScope;

    public function key(): string
    {
        return 'tickets.by_department';
    }

    public function title(): string
    {
        return 'Ticket ตามแผนกและหมวด';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfMonth()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('priority', Options::fromLabels(self::priorityKeys())),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        [$from, $to] = $this->dayRange($filters);
        $levels = $this->levels($viewer);

        // Category and status values are enum constants, never reader input, so they are inlined.
        $perCategory = array_map(
            fn (TicketCategory $c) => in_array($c->value, $levels, true)
                ? "SUM(CASE WHEN tickets.category = '{$c->value}' THEN 1 ELSE 0 END) as cat_{$c->value}"
                : "NULL as cat_{$c->value}",
            TicketCategory::cases(),
        );

        return $this->scopedTickets($viewer)
            ->leftJoin('employees', 'employees.id', '=', 'tickets.requester_id')
            ->leftJoin('departments', 'departments.id', '=', 'employees.department_id')
            ->selectRaw(implode(', ', [
                'MIN(tickets.id) as id',
                'departments.id as department_id',
                'departments.name as department_name',
                'departments.name_th as department_name_th',
                'COUNT(*) as total_count',
                ...$perCategory,
                "SUM(CASE WHEN tickets.status IN ('open', 'in_progress') THEN 1 ELSE 0 END) as live_count",
                'SUM(CASE WHEN '.self::metSql().' THEN 1 ELSE 0 END) as sla_met',
                'SUM(CASE WHEN '.self::measuredSql().' THEN 1 ELSE 0 END) as sla_measured',
            ]))
            ->whereBetween('tickets.created_at', [$from, $to])
            ->when($filters['priority'], fn (Builder $q, string $priority) => $q->where('tickets.priority', $priority))
            // MariaDB has no functional-dependency check: every selected department column is grouped.
            ->groupBy('departments.id', 'departments.name', 'departments.name_th')
            ->orderByDesc('total_count')
            ->orderBy('departments.name');
    }

    public function columns(): array
    {
        $count = fn (string $alias) => fn (Ticket $t) => $t->getAttribute($alias) === null ? null : (int) $t->getAttribute($alias);
        $categories = array_map(
            fn (TicketCategory $c) => ReportColumn::number("cat_{$c->value}", self::categoryTh()[$c->value], $count("cat_{$c->value}")),
            TicketCategory::cases(),
        );

        return [
            ReportColumn::localized('department', 'แผนก', fn (Ticket $t) => $t->getAttribute('department_id') === null
                ? ['name' => 'No department', 'name_th' => 'ไม่ระบุแผนก']
                : ['name' => $t->getAttribute('department_name'), 'name_th' => $t->getAttribute('department_name_th')]),
            ReportColumn::number('total_count', 'ทั้งหมด', $count('total_count')),
            ...$categories,
            ReportColumn::number('live_count', 'ยังไม่ปิด', $count('live_count')),
            ReportColumn::number('sla_rate', '% ตาม SLA', fn (Ticket $t) => self::percent((int) $t->getAttribute('sla_met'), (int) $t->getAttribute('sla_measured'))),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $rows = (clone $query)->get();
        $sum = fn (string $alias) => (int) $rows->sum(fn (Ticket $t) => (int) $t->getAttribute($alias));

        return [
            ReportSummary::make('total', 'Ticket ทั้งหมด', $sum('total_count')),
            ReportSummary::make('departments', 'แผนก', $rows->count()),
            ReportSummary::make('live', 'ยังไม่ปิด', $sum('live_count'), 'amber'),
            ReportSummary::make('sla_rate', '% ตาม SLA', self::percent($sum('sla_met'), $sum('sla_measured')), 'green'),
        ];
    }
}
