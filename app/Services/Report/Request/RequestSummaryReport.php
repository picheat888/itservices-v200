<?php

namespace App\Services\Report\Request;

use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;

/**
 * "สรุปคำขอตามประเภทและสถานะ" (Report Center → Requests): one row per request type with how
 * many requests submitted in the date range (this year by default) sit in each status, and
 * the share that was approved out of those that got a decision. Busiest type first.
 */
class RequestSummaryReport extends TabularReport
{
    use RequestLabels;

    /** Status column → the request statuses it counts. */
    private const COUNTS = [
        'pending_count' => ['pending'],
        'approved_count' => ['approved'],
        'completed_count' => ['completed'],
        'rejected_count' => ['rejected'],
        'cancelled_count' => ['cancelled'],
    ];

    public function key(): string
    {
        return 'requests.summary';
    }

    public function title(): string
    {
        return 'สรุปคำขอตามประเภทและสถานะ';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfYear()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('department_id', Options::departments()),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        [$from, $to] = $this->dateRange($filters);

        // Status values are enum constants, never reader input, so they are inlined.
        $counts = collect(self::COUNTS)
            ->map(fn (array $statuses, string $alias) => "SUM(CASE WHEN status IN ('".implode("','", $statuses)."') THEN 1 ELSE 0 END) as {$alias}")
            ->implode(', ');

        return ServiceRequest::query()
            // MIN(id) gives each group a stable row id for the page.
            ->selectRaw("MIN(id) as id, type, COUNT(*) as total_count, {$counts}")
            ->whereBetween('created_at', [$from, $to])
            ->when($filters['department_id'], fn (Builder $q, $id) => $q->whereHas('employee', fn (Builder $e) => $e->where('department_id', (int) $id)))
            ->groupBy('type')
            ->orderByDesc('total_count')
            ->orderBy('type');
    }

    public function columns(): array
    {
        $count = fn (string $alias, string $heading) => ReportColumn::number($alias, $heading, fn (ServiceRequest $r) => (int) $r->getAttribute($alias));

        return [
            ReportColumn::enum('request_type', 'ประเภทคำขอ', fn (ServiceRequest $r) => $r->type, self::typeKeys(), self::typeTh()),
            $count('total_count', 'ทั้งหมด'),
            $count('pending_count', 'รออนุมัติ'),
            $count('approved_count', 'อนุมัติแล้ว (รอ IT)'),
            $count('completed_count', 'เสร็จสิ้น'),
            $count('rejected_count', 'ไม่อนุมัติ'),
            $count('cancelled_count', 'ยกเลิก'),
            ReportColumn::number('approval_rate', '% อนุมัติ', fn (ServiceRequest $r) => $this->approvalRate($r)),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $rows = (clone $query)->get();
        $sum = fn (string $alias) => (int) $rows->sum(fn (ServiceRequest $r) => (int) $r->getAttribute($alias));

        return [
            ReportSummary::make('total', 'คำขอทั้งหมด', $sum('total_count')),
            ReportSummary::make('pending', 'รออนุมัติ', $sum('pending_count'), 'amber'),
            ReportSummary::make('completed', 'เสร็จสิ้น', $sum('completed_count'), 'green'),
            ReportSummary::make('rejected', 'ไม่อนุมัติ', $sum('rejected_count'), 'red'),
        ];
    }

    /** Approved (incl. completed) out of every request that got a decision, in whole percent; null before any decision. */
    private function approvalRate(ServiceRequest $row): ?int
    {
        $approved = (int) $row->getAttribute('approved_count') + (int) $row->getAttribute('completed_count');
        $decided = $approved + (int) $row->getAttribute('rejected_count');

        return $decided === 0 ? null : (int) round($approved / $decided * 100);
    }
}
