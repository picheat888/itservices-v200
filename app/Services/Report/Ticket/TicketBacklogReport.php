<?php

namespace App\Services\Report\Ticket;

use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Services\Report\TicketLabels;
use App\Services\Report\TicketMetrics;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * "Ticket ค้าง และเกิน SLA" (Report Center → Tickets, /reports/tickets-backlog): every ticket still
 * open or in progress, most overdue first, with its age, the deadline it is running against now
 * (first response while waiting to be taken, resolution afterwards — TicketMetrics::activeDue),
 * which of the two that is, and how many hours are left on it (negative = already over SLA).
 *
 * SLA states: over_sla (past the deadline), due_soon (inside the next 24 hours), on_track (more
 * than 24 hours to go, or no deadline). `board()` gives the page's due board, owner and category
 * cards every live ticket the other filters keep, unpaged and without the SLA filter, so the
 * page can count each state and narrow them itself.
 */
class TicketBacklogReport extends TabularReport
{
    use TicketReportScope;

    private const SLA_KEYS = ['over_sla' => 'rep_sla_over_sla', 'due_soon' => 'rep_sla_due_soon', 'on_track' => 'rep_sla_on_track'];

    private const DUE_KIND_KEYS = ['response' => 'rep_due_kind_response', 'resolve' => 'rep_due_kind_resolve'];

    private const DUE_KIND_TH = ['response' => 'รอรับเคส', 'resolve' => 'รอปิดเคส'];

    /** The sheet's SLA bucket, worded as the page's SLA segments. */
    private const SLA_STATE_TH = ['over_sla' => 'เกิน SLA', 'due_soon' => 'ใกล้ครบ (ภายใน 24 ชม.)', 'on_track' => 'ยังไม่ถึง', 'no_due' => 'ไม่มีกำหนด'];

    /** tickets.source on screen (i18n keys) — the file reads TicketLabels::source(). */
    private const SOURCE_KEYS = ['manual' => 'rep_source_manual', 'auto_request' => 'rep_source_auto_request'];

    /** "Due soon" reaches this far ahead. */
    private const SOON_HOURS = 24;

    public function key(): string
    {
        return 'tickets.backlog';
    }

    public function title(): string
    {
        return 'Ticket ค้าง และเกิน SLA';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('sla', Options::fromLabels(self::SLA_KEYS)),
            ReportFilter::select('category', Options::fromLabels(self::categoryKeys())),
            ReportFilter::select('priority', Options::fromLabels(self::priorityKeys())),
            ReportFilter::select('assignee', self::assigneeOptions()),
            ReportFilter::select('source', Options::fromLabels(self::SOURCE_KEYS)),
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
            // Who opened it: a person (manual) or an approved request (auto_request) — tickets.source.
            ->when($filters['source'] ?? null, fn (Builder $q, string $source) => $q->where('source', $source))
            ->when($filters['sla'], fn (Builder $q, string $sla) => match ($sla) {
                'over_sla' => $q->whereRaw(self::overSlaSql()),
                'due_soon' => $q->whereRaw('NOT '.self::overSlaSql())->whereRaw("{$due} <= {$soon}"),
                default => $q->whereRaw('NOT '.self::overSlaSql())->whereRaw("({$due} IS NULL OR {$due} > {$soon})"),
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

    /**
     * Read left to right as the page's job: which ticket, then how its SLA stands (time left,
     * which deadline, when) — on screen without scrolling — then who and what, then its age.
     */
    public function columns(): array
    {
        return [
            ReportColumn::text('ticket_no', 'เลขที่ Ticket', fn (Ticket $t) => $t->ticket_no)->linkTo('/tickets', fn (Ticket $t) => $t->id),
            ReportColumn::text('subject', 'เรื่อง', fn (Ticket $t) => $t->subject),
            ReportColumn::hoursLeft('hours_left', 'เหลือ (ชม.)', fn (Ticket $t) => self::hoursLeft($t)),
            ReportColumn::enum('due_kind', 'เงื่อนไข SLA (ในสถานะปัจจุบัน)', fn (Ticket $t) => self::dueKind($t), self::DUE_KIND_KEYS, self::DUE_KIND_TH),
            ReportColumn::dateTime('due_at', 'วันที่ครบกำหนด SLA (ในสถานะปัจจุบัน)', fn (Ticket $t) => TicketMetrics::activeDue($t)),
            ReportColumn::enum('priority', 'ความสำคัญ', fn (Ticket $t) => $t->priority, self::priorityKeys(), self::priorityTh()),
            ReportColumn::enum('ticket_status', 'สถานะ', fn (Ticket $t) => $t->status, self::statusKeys(), self::statusTh()),
            ReportColumn::text('assignee', 'ผู้รับผิดชอบ', fn (Ticket $t) => $t->assignee?->name),
            ReportColumn::enum('source', 'ที่มา', fn (Ticket $t) => $t->source, self::SOURCE_KEYS, ['manual' => TicketLabels::source('manual'), 'auto_request' => TicketLabels::source('auto_request')]),
            ReportColumn::enum('category', 'หมวด', fn (Ticket $t) => $t->category, self::categoryKeys(), self::categoryTh()),
            ReportColumn::localized('requester', 'ผู้แจ้ง', fn (Ticket $t) => $t->requester ? ['name' => $t->requester->name, 'name_th' => $t->requester->name_th] : null)
                ->labelKey('rep_c_ticket_requester'),
            ReportColumn::localized('department', 'แผนก', fn (Ticket $t) => ($d = $t->requester?->department) ? ['name' => $d->name, 'name_th' => $d->name_th] : null),
            ReportColumn::dateTime('opened_at', 'วันที่แจ้ง', fn (Ticket $t) => $t->created_at),
            ReportColumn::number('age_days', 'ค้างมา (วัน)', fn (Ticket $t) => $t->created_at === null ? null : round($t->created_at->diffInHours(now(), true) / 24, 1)),
            // The Excel sheet only — for working the backlog over in a spreadsheet.
            ReportColumn::enum('work_class', 'ลักษณะงาน', fn (Ticket $t) => $t->work_class, [], self::workClassTh())->sheetOnly(),
            ReportColumn::text('description', 'รายละเอียด', fn (Ticket $t) => $t->description === null ? null : trim($t->description))->sheetOnly(),
            ReportColumn::dateTime('response_due_at', 'วันที่ครบกำหนด SLA รับเคส', fn (Ticket $t) => $t->sla_response_due_at)->sheetOnly(),
            ReportColumn::dateTime('resolve_due_at', 'วันที่ครบกำหนด SLA ปิดเคส', fn (Ticket $t) => $t->sla_resolve_due_at)->sheetOnly(),
            ReportColumn::enum('sla_state', 'สถานะ SLA', fn (Ticket $t) => self::slaState($t), [], self::SLA_STATE_TH)->sheetOnly(),
        ];
    }

    /**
     * The Excel sheet grouped for analysis: the case, who, where it stands, then its SLA — the two
     * deadlines, the one it is now held to, the hours left and which SLA bucket that puts it in.
     * Rows keep the page's order, most overdue first, so the buckets run in blocks down the sheet.
     *
     * @return list<string>
     */
    protected function sheetOrder(): array
    {
        return [
            'ticket_no', 'subject', 'description', 'category', 'work_class', 'priority', 'source',
            'requester', 'department', 'assignee',
            'ticket_status', 'opened_at', 'age_days',
            'response_due_at', 'resolve_due_at', 'due_kind', 'due_at', 'hours_left', 'sla_state',
        ];
    }

    /** Which of the page's SLA segments a ticket falls in, for a column to group or filter the sheet by. */
    private static function slaState(Ticket $ticket): string
    {
        $hours = self::hoursLeft($ticket);

        return match (true) {
            $hours === null => 'no_due',
            $hours < 0 => 'over_sla',
            $hours <= self::SOON_HOURS => 'due_soon',
            default => 'on_track',
        };
    }

    public function summary(Builder $query, array $filters): array
    {
        $bare = fn () => (clone $query)->setEagerLoads([])->reorder();
        $due = self::dueSql();
        $soon = self::soonSql();
        $total = $bare()->count();
        $hoursSince = fn (?string $moment) => $moment === null ? null : round(Carbon::parse($moment)->diffInMinutes(now(), true) / 60, 1);
        // How bad each tile is: the longest past its deadline, the next deadline still ahead, the longest waiting to be taken.
        $mostOverdue = $bare()->whereRaw(self::overSlaSql())->select(DB::raw("MIN({$due}) as due"))->value('due');
        $nextDue = $bare()->whereRaw('NOT '.self::overSlaSql())->whereRaw("{$due} IS NOT NULL")->select(DB::raw("MIN({$due}) as due"))->value('due');
        $oldestUnassigned = $bare()->whereNull('assignee_id')->min('created_at');

        return [
            ReportSummary::make('total', 'ทั้งหมด', $total)->withSplit([
                ['key' => 'open', 'label_key' => 'rep_k_open', 'tone' => 'soft-blue', 'value' => $bare()->where('status', 'open')->count()],
                ['key' => 'in_progress', 'label_key' => 'rep_k_in_progress', 'tone' => 'soft-amber', 'value' => $bare()->where('status', 'in_progress')->count()],
            ]),
            ReportSummary::make('over_sla', 'เกิน SLA', $bare()->whereRaw(self::overSlaSql())->count(), 'soft-red')
                ->withShareOf($total)
                ->withNote($mostOverdue === null ? null : ['label_key' => 'rep_bl_note_most_overdue', 'hours' => $hoursSince($mostOverdue)]),
            ReportSummary::make('due_soon', 'ครบกำหนดใน 24 ชม.', $bare()->whereRaw('NOT '.self::overSlaSql())->whereRaw("{$due} <= {$soon}")->count(), 'soft-amber')
                ->withShareOf($total)
                ->withNote($nextDue === null ? null : ['label_key' => 'rep_bl_note_next_due', 'at' => Carbon::parse($nextDue)->format('Y-m-d H:i')]),
            ReportSummary::make('unassigned', 'ยังไม่มีผู้รับ', $bare()->whereNull('assignee_id')->count(), 'soft-amber')
                ->withShareOf($total)
                ->withNote($oldestUnassigned === null ? null : ['label_key' => 'rep_bl_note_longest_wait', 'hours' => $hoursSince((string) $oldestUnassigned)]),
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
