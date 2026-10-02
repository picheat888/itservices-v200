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
 * "Ticket ค้างและเกิน SLA" (Report Center → Tickets, /reports/tickets-backlog): every ticket still
 * open or in progress, most overdue first, with its age, the deadline it is running against now
 * (first response while waiting to be taken, resolution afterwards — TicketMetrics::activeDue),
 * which of the two that is, and how many hours are left on it (negative = already breached).
 *
 * SLA states: breached (past the deadline), due_soon (inside the next 24 hours), on_track (more
 * than 24 hours to go, or no deadline). `board()` gives the page's due board, owner and category
 * cards every live ticket the other filters keep, unpaged and without the SLA filter, so the
 * page can count each state and narrow them itself.
 */
class TicketBacklogReport extends TabularReport
{
    use TicketReportScope;

    private const SLA_KEYS = ['breached' => 'rep_sla_breached', 'due_soon' => 'rep_sla_due_soon', 'on_track' => 'rep_sla_on_track'];

    private const DUE_KIND_KEYS = ['response' => 'rep_due_kind_response', 'resolve' => 'rep_due_kind_resolve'];

    private const DUE_KIND_TH = ['response' => 'รอรับเคส', 'resolve' => 'รอปิดเคส'];

    /** "Due soon" reaches this far ahead. */
    private const SOON_HOURS = 24;

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
            ReportFilter::select('assignee', self::assigneeOptions()),
            ReportFilter::search(),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        $due = self::dueSql();
        $soon = self::soonSql();

        return $this->scopedTickets($viewer, $filters['category'])
            ->with(['requester:id,code,first_name,last_name,first_name_th,last_name_th,department_id', 'requester.department:id,name,name_th', 'assignee:id,name'])
            ->whereIn('status', ['open', 'in_progress'])
            ->when($filters['priority'], fn (Builder $q, string $priority) => $q->where('priority', $priority))
            ->when($filters['assignee'] ?? null, fn (Builder $q, string|int $assignee) => $assignee === 'none'
                ? $q->whereNull('assignee_id')
                : $q->where('assignee_id', (int) $assignee))
            ->when($filters['sla'], fn (Builder $q, string $sla) => match ($sla) {
                'breached' => $q->whereRaw(self::breachedSql()),
                'due_soon' => $q->whereRaw('NOT '.self::breachedSql())->whereRaw("{$due} <= {$soon}"),
                default => $q->whereRaw('NOT '.self::breachedSql())->whereRaw("({$due} IS NULL OR {$due} > {$soon})"),
            })
            ->when($filters['search'], function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(fn (Builder $w) => $w->where('ticket_no', 'like', $like)->orWhere('subject', 'like', $like));
            })
            // Most overdue first; a ticket with no deadline at all goes last.
            ->orderByRaw("CASE WHEN {$due} IS NULL THEN 1 ELSE 0 END")
            ->orderByRaw($due)
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
            ReportColumn::localized('requester', 'ผู้แจ้ง', fn (Ticket $t) => $t->requester ? ['name' => $t->requester->name, 'name_th' => $t->requester->name_th] : null)
                ->labelKey('rep_c_ticket_requester'),
            ReportColumn::localized('department', 'แผนก', fn (Ticket $t) => ($d = $t->requester?->department) ? ['name' => $d->name, 'name_th' => $d->name_th] : null),
            ReportColumn::text('assignee', 'ผู้รับผิดชอบ', fn (Ticket $t) => $t->assignee?->name),
            ReportColumn::date('opened_at', 'วันที่แจ้ง', fn (Ticket $t) => $t->created_at),
            ReportColumn::number('age_days', 'ค้างมา (วัน)', fn (Ticket $t) => $t->created_at === null ? null : round($t->created_at->diffInHours(now(), true) / 24, 1)),
            ReportColumn::date('due_at', 'ครบกำหนด SLA', fn (Ticket $t) => TicketMetrics::activeDue($t)),
            ReportColumn::enum('due_kind', 'เงื่อนไข SLA', fn (Ticket $t) => self::dueKind($t), self::DUE_KIND_KEYS, self::DUE_KIND_TH),
            ReportColumn::hoursLeft('hours_left', 'เหลือ (ชม.)', fn (Ticket $t) => self::hoursLeft($t)),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $bare = fn () => (clone $query)->setEagerLoads([])->reorder();
        $due = self::dueSql();
        $soon = self::soonSql();

        return [
            ReportSummary::make('total', 'ทั้งหมด', $bare()->count())->withSplit([
                ['key' => 'open', 'label_key' => 'rep_k_open', 'tone' => 'blue', 'value' => $bare()->where('status', 'open')->count()],
                ['key' => 'in_progress', 'label_key' => 'rep_k_in_progress', 'tone' => 'amber', 'value' => $bare()->where('status', 'in_progress')->count()],
            ]),
            ReportSummary::make('breached', 'เกิน SLA', $bare()->whereRaw(self::breachedSql())->count(), 'red'),
            ReportSummary::make('due_soon', 'ครบกำหนดใน 24 ชม.', $bare()->whereRaw('NOT '.self::breachedSql())->whereRaw("{$due} <= {$soon}")->count(), 'amber'),
            ReportSummary::make('unassigned', 'ยังไม่มีผู้รับ', $bare()->whereNull('assignee_id')->count(), 'amber'),
        ];
    }

    /**
     * Every live ticket the filters keep, the SLA filter aside, as the page's due board draws
     * them — unpaged (a backlog is short), most overdue first.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{id: int, ticket_no: string, subject: string, category: ?string, priority: ?string, status: ?string, assignee_id: ?int, assignee: ?string, department: ?array{name: ?string, name_th: ?string}, due_at: ?string, due_kind: ?string, hours_left: ?float}>
     */
    public function board(User $viewer, array $filters): array
    {
        return $this->query($viewer, [...$filters, 'sla' => null])->get()
            ->map(fn (Ticket $t) => [
                'id' => $t->id,
                'ticket_no' => $t->ticket_no,
                'subject' => $t->subject,
                'category' => $t->category?->value,
                'priority' => $t->priority?->value,
                'status' => $t->status?->value,
                'assignee_id' => $t->assignee_id,
                'assignee' => $t->assignee?->name,
                'department' => ($d = $t->requester?->department) ? ['name' => $d->name, 'name_th' => $d->name_th] : null,
                'due_at' => TicketMetrics::activeDue($t)?->format('Y-m-d H:i'),
                'due_kind' => self::dueKind($t),
                'hours_left' => self::hoursLeft($t),
            ])
            ->values()
            ->all();
    }

    /** "response" while the ticket waits to be taken, "resolve" afterwards — which deadline activeDue picked. */
    private static function dueKind(Ticket $ticket): ?string
    {
        if (TicketMetrics::activeDue($ticket) === null) {
            return null;
        }

        return $ticket->status?->value === 'open' && $ticket->responded_at === null ? 'response' : 'resolve';
    }

    private static function hoursLeft(Ticket $ticket): ?float
    {
        $due = TicketMetrics::activeDue($ticket);

        return $due === null ? null : round(now()->diffInMinutes($due, false) / 60, 1);
    }

    /** SQL: the deadline a live ticket runs against now (TicketMetrics::activeDue). */
    private static function dueSql(): string
    {
        return "(CASE WHEN tickets.status = 'open' AND tickets.responded_at IS NULL THEN tickets.sla_response_due_at ELSE tickets.sla_resolve_due_at END)";
    }

    /** SQL: the edge of "due soon", the app clock inlined (generated here, never reader input). */
    private static function soonSql(): string
    {
        return "'".now()->addHours(self::SOON_HOURS)->toDateTimeString()."'";
    }

    /**
     * Who may be picked: anyone who has ever held a ticket, plus "ยังไม่มีผู้รับ" for the cases
     * nobody has taken — the queue to hand out.
     *
     * @return list<array<string, mixed>>
     */
    private static function assigneeOptions(): array
    {
        $ids = Ticket::query()->whereNotNull('assignee_id')->distinct()->pluck('assignee_id');

        return [
            ['value' => 'none', 'label_key' => 'rep_opt_unassigned'],
            ...User::query()->whereIn('id', $ids)->orderBy('name')->get(['id', 'name'])
                ->map(fn (User $u) => ['value' => $u->id, 'label' => $u->name, 'label_th' => null])->all(),
        ];
    }
}
