<?php

namespace App\Services\Report\Request;

use App\Models\Request\ServiceRequest;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Services\Report\TicketLabels;
use Illuminate\Database\Eloquent\Builder;

/**
 * "คำขอที่รอดำเนินการโดย IT" (Report Center → Requests): every request that has cleared its
 * approvals and now waits on IT to deliver (status `approved`), longest wait first, with the
 * ticket it opened and who holds that ticket.
 */
class ItPendingRequestReport extends TabularReport
{
    use RequestLabels;

    private const TICKET_STATUS_KEYS = [
        'open' => 'ticket_open', 'in_progress' => 'ticket_in_progress',
        'completed' => 'ticket_completed', 'canceled' => 'ticket_canceled',
    ];

    public function key(): string
    {
        return 'requests.it_pending';
    }

    public function title(): string
    {
        return 'คำขอที่รอดำเนินการโดย IT';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('type', Options::fromLabels(self::typeKeys())),
            ReportFilter::select('department_id', Options::departments()),
            ReportFilter::search(),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        return ServiceRequest::query()
            ->with(['ticket:id,ticket_no,status,assignee_id', 'ticket.assignee:id,name'])
            ->where('status', 'approved')
            ->when($filters['type'], fn (Builder $q, string $type) => $q->where('type', $type))
            ->when($filters['department_id'], fn (Builder $q, $id) => $q->whereHas('employee', fn (Builder $e) => $e->where('department_id', (int) $id)))
            ->when($filters['search'], function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(fn (Builder $w) => $w->where('reference', 'like', $like)
                    ->orWhere('title', 'like', $like)
                    ->orWhere('requester_name', 'like', $like));
            })
            ->orderBy('approved_at')
            ->orderBy('id');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('request_no', 'เลขที่คำขอ', fn (ServiceRequest $r) => $r->reference)->linkTo('/requests', fn (ServiceRequest $r) => $r->id),
            ReportColumn::enum('request_type', 'ประเภทคำขอ', fn (ServiceRequest $r) => $r->type, self::typeKeys(), self::typeTh()),
            ReportColumn::text('title', 'เรื่อง', fn (ServiceRequest $r) => $r->title),
            ReportColumn::text('requester', 'ผู้ขอ', fn (ServiceRequest $r) => $r->requester_name),
            ReportColumn::text('department_name', 'แผนก', fn (ServiceRequest $r) => $r->department_name),
            ReportColumn::date('approved_at', 'อนุมัติเมื่อ', fn (ServiceRequest $r) => $r->approved_at),
            ReportColumn::number('waiting_days', 'รอมาแล้ว (วัน)', fn (ServiceRequest $r) => $this->waitingDays($r)),
            ReportColumn::text('ticket_no', 'Ticket', fn (ServiceRequest $r) => $r->ticket?->ticket_no)->linkTo('/tickets', fn (ServiceRequest $r) => $r->ticket?->id),
            ReportColumn::enum('ticket_status', 'สถานะ Ticket', fn (ServiceRequest $r) => $r->ticket?->status, self::TICKET_STATUS_KEYS, self::ticketStatusTh()),
            ReportColumn::text('assignee', 'ผู้รับผิดชอบ', fn (ServiceRequest $r) => $r->ticket?->assignee?->name),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $bare = fn () => (clone $query)->setEagerLoads([])->reorder();

        return [
            ReportSummary::make('total', 'ทั้งหมด', $bare()->count()),
            ReportSummary::make('over_3_days', 'รอเกิน 3 วัน', $bare()->where('approved_at', '<', now()->subDays(3))->count(), 'amber'),
            ReportSummary::make('over_7_days', 'รอเกิน 7 วัน', $bare()->where('approved_at', '<', now()->subDays(7))->count(), 'red'),
            ReportSummary::make('no_ticket', 'ยังไม่มี Ticket', $bare()->whereNull('ticket_id')->count()),
        ];
    }

    /** @return array<string, string> ticket status → Thai label, the same wording as the Ticket & SLA report */
    private static function ticketStatusTh(): array
    {
        $labels = [];
        foreach (array_keys(self::TICKET_STATUS_KEYS) as $status) {
            $labels[$status] = (string) TicketLabels::status($status);
        }

        return $labels;
    }

    private function waitingDays(ServiceRequest $request): ?int
    {
        return $request->approved_at === null ? null
            : (int) $request->approved_at->copy()->startOfDay()->diffInDays(today());
    }
}
