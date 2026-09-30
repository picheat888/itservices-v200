<?php

namespace App\Services\Report\Request;

use App\Models\Request\RequestApproval;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;

/**
 * "ระยะเวลาอนุมัติแต่ละขั้น" (Report Center → Requests): who requests wait on longest. One row
 * per approver over the approval steps that reached them in the date range (this month by
 * default) — how many, how long a decision took on average and at worst, and how many still
 * sit with them now. Slowest average first.
 *
 * - Only `approval` steps count; the final `completion` step is IT's work, reported by
 *   "คำขอที่รอดำเนินการโดย IT".
 * - The approver is whoever decided the step, else the named approver still holding it,
 *   else the step's label (a department/group step nobody has picked up).
 * - A step still waiting counts up to now. A waiting step on a request that is no longer
 *   pending (cancelled underneath it) is left out: nobody is actually holding it.
 */
class ApprovalTimeReport extends TabularReport
{
    use RequestLabels;

    private const APPROVER = 'COALESCE(acted_by_name, approver_name, label)';

    public function key(): string
    {
        return 'requests.approval_time';
    }

    public function title(): string
    {
        return 'ระยะเวลาอนุมัติแต่ละขั้น';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfMonth()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('type', Options::fromLabels(self::typeKeys())),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        [$from, $to] = $this->dayRange($filters);
        $hours = $this->hoursWaited();
        $approver = self::APPROVER;

        return RequestApproval::query()
            ->selectRaw(implode(', ', [
                'MIN(id) as id',
                "{$approver} as approver",
                'COUNT(*) as steps',
                "SUM(CASE WHEN status = 'current' THEN 1 ELSE 0 END) as waiting_now",
                "AVG({$hours}) as avg_hours",
                "MAX({$hours}) as max_hours",
                "MAX(CASE WHEN status = 'current' THEN {$hours} END) as oldest_waiting_hours",
            ]))
            ->where('kind', 'approval')
            ->whereNotNull('became_current_at')
            ->whereBetween('became_current_at', [$from, $to])
            ->where(fn (Builder $q) => $q
                ->whereIn('status', ['approved', 'rejected'])
                ->orWhere(fn (Builder $c) => $c->where('status', 'current')->whereHas('request', fn (Builder $r) => $r->where('status', 'pending'))))
            ->when($filters['type'], fn (Builder $q, string $type) => $q->whereHas('request', fn (Builder $r) => $r->where('type', $type)))
            ->groupByRaw($approver)
            ->orderByDesc('avg_hours')
            ->orderByRaw($approver);
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('approver', 'ผู้อนุมัติ', fn (RequestApproval $a) => $a->getAttribute('approver')),
            ReportColumn::number('steps', 'จำนวนขั้น', fn (RequestApproval $a) => (int) $a->getAttribute('steps')),
            ReportColumn::number('waiting_now', 'ค้างอยู่ตอนนี้', fn (RequestApproval $a) => (int) $a->getAttribute('waiting_now')),
            ReportColumn::number('avg_days', 'เฉลี่ย (วัน)', fn (RequestApproval $a) => $this->days($a->getAttribute('avg_hours'))),
            ReportColumn::number('max_days', 'นานสุด (วัน)', fn (RequestApproval $a) => $this->days($a->getAttribute('max_hours'))),
            ReportColumn::number('oldest_waiting_days', 'ค้างนานสุด (วัน)', fn (RequestApproval $a) => $this->days($a->getAttribute('oldest_waiting_hours'))),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $rows = (clone $query)->get();
        $steps = (int) $rows->sum(fn (RequestApproval $a) => (int) $a->getAttribute('steps'));
        // Weighted by steps, so one slow approver with a single step doesn't set the average.
        $weightedHours = $steps === 0 ? null
            : $rows->sum(fn (RequestApproval $a) => (float) $a->getAttribute('avg_hours') * (int) $a->getAttribute('steps')) / $steps;

        return [
            ReportSummary::make('total', 'ผู้อนุมัติ', $rows->count()),
            ReportSummary::make('steps', 'ขั้นอนุมัติ', $steps),
            ReportSummary::make('waiting_now', 'ค้างอยู่ตอนนี้', (int) $rows->sum(fn (RequestApproval $a) => (int) $a->getAttribute('waiting_now')), 'amber'),
            ReportSummary::make('avg_days', 'เฉลี่ยทั้งหมด (วัน)', $this->days($weightedHours)),
        ];
    }

    /**
     * Hours from the step reaching its approver to the decision (or to now while it waits),
     * as SQL. The two drivers spell date arithmetic differently: MariaDB/MySQL on the live
     * server, SQLite in the test suite. "Now" is the app clock, inlined — it is generated
     * here, never reader input.
     */
    private function hoursWaited(): string
    {
        $end = "COALESCE(acted_at, '".now()->toDateTimeString()."')";

        return (new RequestApproval)->getConnection()->getDriverName() === 'sqlite'
            ? "((julianday({$end}) - julianday(became_current_at)) * 24)"
            : "(TIMESTAMPDIFF(SECOND, became_current_at, {$end}) / 3600)";
    }

    private function days(mixed $hours): ?float
    {
        return $hours === null ? null : round((float) $hours / 24, 1);
    }
}
