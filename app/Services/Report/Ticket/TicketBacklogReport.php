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

/**
 * "Ticket ค้างและเกิน SLA" (Report Center → Tickets): every ticket still open or in progress,
 * oldest first, with its age, the deadline it is running against now (first response while
 * waiting to be taken, resolution afterwards — TicketMetrics::activeDue) and how many hours
 * are left on it (negative = already breached).
 */
class TicketBacklogReport extends TabularReport
{
    use TicketReportScope;

    private const SLA_KEYS = ['breached' => 'rep_sla_breached', 'on_track' => 'rep_sla_on_track'];

    public function key(): string
    {
        return 'tickets.backlog';
    }

    public function title(): string
    {
        return 'Ticket ค้างและเกิน SLA';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('sla', Options::fromLabels(self::SLA_KEYS)),
            ReportFilter::select('category', Options::fromLabels(self::categoryKeys())),
            ReportFilter::select('priority', Options::fromLabels(self::priorityKeys())),
            ReportFilter::search(),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        return $this->scopedTickets($viewer, $filters['category'])
            ->with(['requester:id,code,first_name,last_name,first_name_th,last_name_th,department_id', 'requester.department:id,name,name_th', 'assignee:id,name'])
            ->whereIn('status', ['open', 'in_progress'])
            ->when($filters['priority'], fn (Builder $q, string $priority) => $q->where('priority', $priority))
            ->when($filters['sla'], fn (Builder $q, string $sla) => $sla === 'breached'
                ? $q->whereRaw(self::breachedSql())
                : $q->whereRaw('NOT '.self::breachedSql()))
            ->when($filters['search'], function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(fn (Builder $w) => $w->where('ticket_no', 'like', $like)->orWhere('subject', 'like', $like));
            })
            ->orderBy('created_at')
            ->orderBy('id');
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('ticket_no', 'เลขที่ Ticket', fn (Ticket $t) => $t->ticket_no)->linkTo('/tickets', fn (Ticket $t) => $t->id),
            ReportColumn::text('subject', 'เรื่อง', fn (Ticket $t) => $t->subject),
            ReportColumn::enum('category', 'หมวด', fn (Ticket $t) => $t->category, self::categoryKeys(), self::categoryTh()),
            ReportColumn::enum('priority', 'ความสำคัญ', fn (Ticket $t) => $t->priority, self::priorityKeys(), self::priorityTh()),
            ReportColumn::enum('ticket_status', 'สถานะ', fn (Ticket $t) => $t->status, self::statusKeys(), self::statusTh()),
            ReportColumn::localized('requester', 'ผู้แจ้ง', fn (Ticket $t) => $t->requester ? ['name' => $t->requester->name, 'name_th' => $t->requester->name_th] : null),
            ReportColumn::localized('department', 'แผนก', fn (Ticket $t) => ($d = $t->requester?->department) ? ['name' => $d->name, 'name_th' => $d->name_th] : null),
            ReportColumn::text('assignee', 'ผู้รับผิดชอบ', fn (Ticket $t) => $t->assignee?->name),
            ReportColumn::date('opened_at', 'วันที่แจ้ง', fn (Ticket $t) => $t->created_at),
            ReportColumn::number('age_days', 'ค้างมา (วัน)', fn (Ticket $t) => $t->created_at === null ? null : round($t->created_at->diffInHours(now(), true) / 24, 1)),
            ReportColumn::date('due_at', 'ครบกำหนด SLA', fn (Ticket $t) => TicketMetrics::activeDue($t)),
            ReportColumn::number('hours_left', 'เหลือ (ชม.)', fn (Ticket $t) => ($due = TicketMetrics::activeDue($t)) === null ? null : round(now()->diffInMinutes($due, false) / 60, 1)),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $bare = fn () => (clone $query)->setEagerLoads([])->reorder();

        return [
            ReportSummary::make('total', 'ทั้งหมด', $bare()->count()),
            ReportSummary::make('open', 'รอรับเรื่อง', $bare()->where('status', 'open')->count(), 'amber'),
            ReportSummary::make('in_progress', 'กำลังดำเนินการ', $bare()->where('status', 'in_progress')->count()),
            ReportSummary::make('breached', 'เกิน SLA', $bare()->whereRaw(self::breachedSql())->count(), 'red'),
        ];
    }
}
