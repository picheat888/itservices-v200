<?php

namespace App\Services\Report\Ticket;

use App\Enums\Request\RequestType;
use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketSource;
use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Report\Request\RequestLabels;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Services\Report\TicketMetrics;
use App\Support\TicketSla;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "สรุปผล SLA ของ Ticket จากคำขอ" (Report Center → Tickets, /reports/tickets-request-sla): the tickets the
 * system opened from approved requests (tickets.source = auto_request), measured per request
 * type — how many, how many were taken in time (first response), how many were closed in time
 * (resolution), and how long both took on average.
 *
 * Rows are the tickets themselves, newest first. The per-type table, the "still open" list and the
 * SLA rules the page draws above them come from `breakdown()` (its own endpoint, and the file's
 * "ตามประเภทคำขอ" section).
 *
 * The verdicts are TicketMetrics' own: "closed in time" counts completed cases only (canceled and
 * live ones are not in it); "taken in time" counts every case that was taken, against
 * sla_response_due_at. Average times are calendar hours, the same as the Ticket & SLA overview.
 */
class TicketRequestSlaReport extends TabularReport
{
    use RequestLabels;
    use TicketReportScope;

    /** One ticket's SLA cells on the page: in time, late, or still open and already past due. */
    private const SLA_KEYS = ['met' => 'rep_rs_sla_met', 'missed' => 'rep_rs_sla_missed', 'over' => 'rep_rs_sla_over'];

    private const SLA_TH = ['met' => 'ทัน', 'missed' => 'ไม่ทัน', 'over' => 'เกิน SLA'];

    public function key(): string
    {
        return 'tickets.request_sla';
    }

    public function title(): string
    {
        return 'สรุปผล SLA ของ Ticket จากคำขอ';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfYear()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('request_type', Options::fromLabels(self::typeKeys())),
            ReportFilter::select('assignee', self::assigneeOptions()),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        [$from, $to] = $this->dayRange($filters);

        return $this->scopedTickets($viewer)
            ->with([
                'serviceRequest:id,ticket_id,reference,type', 'assignee:id,name',
                // The raw-data sheet's who: the person behind the request and their department.
                'requester:id,code,first_name,last_name,first_name_th,last_name_th,department_id', 'requester.department:id,name,name_th',
            ])
            ->where('tickets.source', TicketSource::AutoRequest->value)
            ->whereBetween('tickets.created_at', [$from, $to])
            ->when($filters['request_type'] ?? null, fn (Builder $q, string $type) => $q->whereHas('serviceRequest', fn (Builder $r) => $r->where('type', $type)))
            ->when($filters['assignee'] ?? null, fn (Builder $q, string|int $assignee) => $q->where('assignee_id', (int) $assignee))
            ->orderByDesc('tickets.created_at')
            ->orderByDesc('tickets.id');
    }

    /**
     * Which ticket and which request, then its two SLA moments: when it was taken and whether
     * that was in time, when it was closed and whether that was in time.
     */
    public function columns(): array
    {
        return [
            ReportColumn::text('ticket_no', 'เลขที่ Ticket', fn (Ticket $t) => $t->ticket_no)->linkTo('/tickets', fn (Ticket $t) => $t->id),
            ReportColumn::text('request_no', 'เลขที่คำขอ', fn (Ticket $t) => $t->serviceRequest?->reference)->linkTo('/requests', fn (Ticket $t) => $t->serviceRequest?->id),
            ReportColumn::enum('request_type', 'ประเภทคำขอ', fn (Ticket $t) => $t->serviceRequest?->type, self::typeKeys(), self::typeTh()),
            ReportColumn::enum('ticket_status', 'สถานะ', fn (Ticket $t) => $t->status, self::statusKeys(), self::statusTh()),
            ReportColumn::text('assignee', 'ผู้รับผิดชอบ', fn (Ticket $t) => $t->assignee?->name),
            ReportColumn::dateTime('opened_at', 'วันที่แจ้ง', fn (Ticket $t) => $t->created_at),
            ReportColumn::dateTime('taken_at', 'รับเคสเมื่อ', fn (Ticket $t) => $t->responded_at),
            ReportColumn::enum('take_sla', 'รับเคสทัน SLA', fn (Ticket $t) => self::takeState($t), self::SLA_KEYS, self::SLA_TH),
            ReportColumn::dateTime('closed_at', 'ปิดเคสเมื่อ', fn (Ticket $t) => $t->status === TicketStatus::Completed ? $t->resolved_at : null),
            ReportColumn::enum('close_sla', 'ปิดทัน SLA', fn (Ticket $t) => self::closeState($t), self::SLA_KEYS, self::SLA_TH),
            ReportColumn::number('fix_hours', 'เวลาปิดเคส (ชม.)', fn (Ticket $t) => $t->status === TicketStatus::Completed ? TicketMetrics::resolveHours($t) : null),
            // The Excel sheet only ("ข้อมูลดิบ") — every field for working the cases over in a spreadsheet.
            ReportColumn::text('subject', 'เรื่อง', fn (Ticket $t) => $t->subject)->sheetOnly(),
            ReportColumn::text('description', 'รายละเอียด', fn (Ticket $t) => $t->description === null ? null : trim($t->description))->sheetOnly(),
            ReportColumn::enum('category', 'หมวด', fn (Ticket $t) => $t->category, [], self::categoryTh())->sheetOnly(),
            ReportColumn::enum('work_class', 'ลักษณะงาน', fn (Ticket $t) => $t->work_class, [], self::workClassTh())->sheetOnly(),
            ReportColumn::enum('priority', 'ความสำคัญ', fn (Ticket $t) => $t->priority, [], self::priorityTh())->sheetOnly(),
            ReportColumn::localized('requester', 'ผู้แจ้ง', fn (Ticket $t) => $t->requester ? ['name' => $t->requester->name, 'name_th' => $t->requester->name_th] : null)->sheetOnly(),
            ReportColumn::localized('department', 'แผนก', fn (Ticket $t) => ($d = $t->requester?->department) ? ['name' => $d->name, 'name_th' => $d->name_th] : null)->sheetOnly(),
            // "2026-09" — a column to pivot the cases by month.
            ReportColumn::text('opened_month', 'เดือนที่แจ้ง', fn (Ticket $t) => $t->created_at?->format('Y-m'))->sheetOnly(),
            ReportColumn::dateTime('canceled_at', 'ยกเลิกเมื่อ', fn (Ticket $t) => $t->status === TicketStatus::Canceled ? $t->resolved_at : null)->sheetOnly(),
            ReportColumn::dateTime('response_due_at', 'วันที่ครบกำหนด SLA รับเคส', fn (Ticket $t) => $t->sla_response_due_at)->sheetOnly(),
            ReportColumn::number('take_hours', 'รอคนรับ (ชม.)', fn (Ticket $t) => $t->responded_at === null || $t->created_at === null
                ? null
                : round($t->created_at->diffInMinutes($t->responded_at, true) / 60, 2))->sheetOnly(),
            ReportColumn::dateTime('resolve_due_at', 'วันที่ครบกำหนด SLA ปิดเคส', fn (Ticket $t) => $t->sla_resolve_due_at)->sheetOnly(),
            // From taking the case to closing it — with รอคนรับ, it makes up เวลาปิดเคส.
            ReportColumn::number('work_hours', 'ลงมือแก้ (ชม.)', fn (Ticket $t) => $t->status === TicketStatus::Completed && $t->responded_at !== null && $t->resolved_at !== null
                ? round($t->responded_at->diffInMinutes($t->resolved_at, true) / 60, 2)
                : null)->sheetOnly(),
        ];
    }

    /** The rows sheet carries every field, so it is the raw data. */
    public function sheetTitle(): string
    {
        return 'ข้อมูลดิบ';
    }

    /**
     * The raw-data sheet grouped for analysis: the case and its request, who, where it stands and
     * when, then each SLA — taking (its deadline, the verdict, the hours it waited) and closing (its
     * deadline, the verdict, the hours to fix). Rows keep the page's order, newest first.
     *
     * @return list<string>
     */
    protected function sheetOrder(): array
    {
        return [
            'ticket_no', 'request_no', 'request_type', 'subject', 'description', 'category', 'work_class', 'priority',
            'requester', 'department', 'assignee',
            'ticket_status', 'opened_at', 'opened_month', 'taken_at', 'closed_at', 'canceled_at',
            'response_due_at', 'take_sla', 'take_hours',
            'resolve_due_at', 'close_sla', 'work_hours', 'fix_hours',
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $tally = self::tally((clone $query)->setEagerLoads([])->get());
        $goal = TicketSla::goalPercent();

        return [
            ReportSummary::make('rs_total', 'Ticket จากคำขอ', $tally['total'])->withSplit([
                ['key' => 'completed', 'label_key' => 'rep_rs_completed', 'tone' => 'soft-green', 'value' => $tally['completed']],
                ['key' => 'canceled', 'label_key' => 'rep_rs_canceled', 'tone' => 'gray', 'value' => $tally['canceled']],
                ['key' => 'open', 'label_key' => 'rep_rs_open', 'tone' => 'soft-blue', 'value' => $tally['open']],
            ]),
            ReportSummary::make('rs_close_rate', 'ปิดทัน SLA (%)', self::percent($tally['close_met'], $tally['close_total']), null, 'percent')
                ->withGoal($goal)
                ->withNote(['label_key' => 'rep_rs_note_close', 'values' => ['met' => $tally['close_met'], 'n' => $tally['close_total']]]),
            ReportSummary::make('rs_take_rate', 'รับเคสทัน SLA (%)', self::percent($tally['take_met'], $tally['take_total']), null, 'percent')
                ->withGoal($goal)
                ->withNote(['label_key' => 'rep_rs_note_take', 'values' => ['met' => $tally['take_met'], 'n' => $tally['take_total']]]),
            // Where the average time went, all over the same completed cases: waiting to be taken (the
            // per-type table's "รอคนรับ (เฉลี่ย)" too), then the work after it — the two add up to the tile.
            ReportSummary::make('rs_fix_avg', 'เวลาปิดเคสเฉลี่ย (ชม.)', $tally['fix_avg_hours'], null, 'hours')
                ->withSplit($tally['take_avg_hours'] === null || $tally['fix_avg_hours'] === null ? [] : [
                    ['key' => 'wait', 'label_key' => 'rep_rs_split_wait', 'tone' => 'soft-amber', 'value' => round($tally['take_avg_hours'], 1)],
                    ['key' => 'work', 'label_key' => 'rep_rs_split_work', 'tone' => 'soft-blue', 'value' => round(max(0, $tally['fix_avg_hours'] - round($tally['take_avg_hours'], 1)), 1)],
                ]),
            // Its share of the cases still open, and which deadline each one missed — nobody has
            // taken it yet, or it was taken but not closed in time — so the reader knows whom to chase.
            ReportSummary::make('rs_over_sla', 'เกิน SLA ตอนนี้', $tally['over_now'], 'soft-red')
                ->withShareOf($tally['open'])
                ->withSplit([
                    ['key' => 'untaken', 'label_key' => 'rep_rs_over_untaken', 'tone' => 'soft-red', 'value' => $tally['over_untaken']],
                    ['key' => 'taken', 'label_key' => 'rep_rs_over_taken', 'tone' => 'soft-orange', 'value' => $tally['over_taken']],
                ]),
        ];
    }

    /**
     * What the page draws above the rows, over the same filters except the request type (the
     * per-type table always lists every type, so a picked one can be seen against the rest):
     * one line per request type plus the whole, the types with no ticket, every live ticket
     * already past its SLA (most overdue first), and the SLA rules the verdicts were measured by.
     *
     * @param  array<string, mixed>  $filters
     * @return array{types: list<array<string, mixed>>, overall: array<string, mixed>, empty_types: list<string>, open: list<array<string, mixed>>, rules: array<string, mixed>}
     */
    public function breakdown(User $viewer, array $filters): array
    {
        $tickets = $this->query($viewer, [...$filters, 'request_type' => null])->get();
        $byType = $tickets->groupBy(fn (Ticket $t) => $t->serviceRequest?->type?->value ?? 'other');

        $types = $byType
            ->map(fn (Collection $group, string $type) => ['type' => $type, ...self::tally($group)])
            ->sortBy([['total', 'desc'], ['type', 'asc']])
            ->values()
            ->all();

        $open = $tickets
            ->filter(fn (Ticket $t) => self::isOverNow($t))
            ->map(fn (Ticket $t) => [
                'id' => $t->id,
                'ticket_no' => $t->ticket_no,
                'request_type' => $t->serviceRequest?->type?->value,
                'due_kind' => $t->status === TicketStatus::Open && $t->responded_at === null ? 'response' : 'resolve',
                'due_at' => TicketMetrics::activeDue($t)?->format('Y-m-d H:i'),
                'over_hours' => ($due = TicketMetrics::activeDue($t)) === null ? null : round($due->diffInMinutes(now(), true) / 60, 1),
            ])
            ->sortByDesc('over_hours')
            ->values()
            ->all();

        $present = array_column($types, 'type');

        return [
            'types' => $types,
            'overall' => self::tally($tickets),
            'empty_types' => array_values(array_diff(array_map(fn (RequestType $t) => $t->value, RequestType::cases()), $present)),
            'open' => $open,
            'rules' => self::slaRules(),
        ];
    }

    /** The file's "ตามประเภทคำขอ" sheet — the page's per-type table, one line per type, then the whole. */
    public function exportSections(User $viewer, array $filters): array
    {
        $breakdown = $this->breakdown($viewer, $filters);
        $typeTh = self::typeTh();
        $line = fn (string $name, array $t) => [
            $name, $t['total'], $t['completed'], $t['canceled'], $t['open'],
            "{$t['take_met']}/{$t['take_total']}", self::percent($t['take_met'], $t['take_total']),
            "{$t['close_met']}/{$t['close_total']}", self::percent($t['close_met'], $t['close_total']),
            $t['take_avg_hours'], $t['fix_avg_hours'],
        ];

        $rows = array_map(fn (array $t) => $line($typeTh[$t['type']] ?? $t['type'], $t), $breakdown['types']);
        $rows[] = $line('รวม', $breakdown['overall']);

        return [[
            'title' => 'ตามประเภทคำขอ',
            'headings' => [
                'ประเภทคำขอ', 'ทั้งหมด', 'เสร็จสิ้น', 'ยกเลิก', 'ยังเปิด',
                'รับเคสทัน SLA (ทัน/รับแล้ว)', 'รับเคสทัน SLA (%)', 'ปิดทัน SLA (ทัน/เสร็จสิ้น)', 'ปิดทัน SLA (%)',
                'รอคนรับเฉลี่ย (ชม.)', 'ปิดเคสเฉลี่ย (ชม.)',
            ],
            'rows' => $rows,
        ]];
    }

    /**
     * Counts and averages over a set of tickets — the one tally the summary tiles, the per-type
     * lines and the file all read.
     *
     * @param  Collection<int, Ticket>  $tickets
     * @return array{total: int, completed: int, canceled: int, open: int, take_met: int, take_total: int, close_met: int, close_total: int, take_avg_hours: ?float, fix_avg_hours: ?float, over_now: int, over_untaken: int, over_taken: int}
     */
    private static function tally(Collection $tickets): array
    {
        $take = $tickets->map(fn (Ticket $t) => self::takeState($t));
        $close = $tickets->map(fn (Ticket $t) => self::closeState($t));
        // Every time on the page is averaged over the completed cases, so the tile's parts add up and
        // the per-type table's take time is the tile's.
        $takeHours = $tickets->filter(fn (Ticket $t) => $t->status === TicketStatus::Completed && $t->responded_at !== null)
            // Unrounded until the average, so a 20-minute take still reads 20 minutes (not 0.3 h = 18).
            ->map(fn (Ticket $t) => $t->created_at->diffInMinutes($t->responded_at, true) / 60);
        $fixHours = $tickets->filter(fn (Ticket $t) => $t->status === TicketStatus::Completed)
            ->map(fn (Ticket $t) => TicketMetrics::resolveHours($t))
            ->filter(fn (?float $h) => $h !== null);

        return [
            'total' => $tickets->count(),
            'completed' => $tickets->filter(fn (Ticket $t) => $t->status === TicketStatus::Completed)->count(),
            'canceled' => $tickets->filter(fn (Ticket $t) => $t->status === TicketStatus::Canceled)->count(),
            'open' => $tickets->filter(fn (Ticket $t) => in_array($t->status, TicketStatus::live(), true))->count(),
            'take_met' => $take->filter(fn (?string $s) => $s === 'met')->count(),
            'take_total' => $take->filter(fn (?string $s) => $s === 'met' || $s === 'missed')->count(),
            'close_met' => $close->filter(fn (?string $s) => $s === 'met')->count(),
            'close_total' => $close->filter(fn (?string $s) => $s === 'met' || $s === 'missed')->count(),
            'take_avg_hours' => $takeHours->isEmpty() ? null : round($takeHours->avg(), 2),
            'fix_avg_hours' => $fixHours->isEmpty() ? null : round($fixHours->avg(), 1),
            'over_now' => $tickets->filter(fn (Ticket $t) => self::isOverNow($t))->count(),
            'over_untaken' => $take->filter(fn (?string $s) => $s === 'over')->count(),
            'over_taken' => $close->filter(fn (?string $s) => $s === 'over')->count(),
        ];
    }

    /**
     * Taking the case: in time or late against sla_response_due_at once taken; while nobody has
     * taken it yet, "over" once that deadline has passed — otherwise there is nothing to judge.
     */
    private static function takeState(Ticket $ticket): ?string
    {
        $due = $ticket->sla_response_due_at;
        if ($due === null) {
            return null;
        }
        if ($ticket->responded_at !== null) {
            return $ticket->responded_at->lte($due) ? 'met' : 'missed';
        }

        return in_array($ticket->status, TicketStatus::live(), true) && $due->lt(now()) ? 'over' : null;
    }

    /**
     * Closing the case: a completed case is in time or late (TicketMetrics::slaState); a live one is
     * "over" once its resolve deadline has passed — but only after someone has taken it, because the
     * resolve clock starts when the case is taken. A case nobody has taken yet is late on *taking*
     * (takeState), not on closing. Canceled ones are not judged.
     */
    private static function closeState(Ticket $ticket): ?string
    {
        if ($ticket->status === TicketStatus::Completed) {
            return match (TicketMetrics::slaState($ticket, now())) {
                'met' => 'met',
                'over_sla' => 'missed',
                default => null,
            };
        }

        $resolveRunning = in_array($ticket->status, TicketStatus::live(), true)
            && ! ($ticket->status === TicketStatus::Open && $ticket->responded_at === null);

        return $resolveRunning && $ticket->sla_resolve_due_at !== null && $ticket->sla_resolve_due_at->lt(now()) ? 'over' : null;
    }

    /** Still open and already past an SLA — not taken in time, or taken but not closed in time. */
    private static function isOverNow(Ticket $ticket): bool
    {
        return self::takeState($ticket) === 'over' || self::closeState($ticket) === 'over';
    }

    private static function percent(int $part, int $whole): ?int
    {
        return $whole === 0 ? null : (int) round($part / $whole * 100);
    }

    /**
     * The SLA these verdicts were measured by, for the page's "เกณฑ์ SLA ที่ใช้วัด" card: the goal,
     * the one first-response target, and each request type's resolution target (null = none set,
     * the ticket falls back to its priority's target).
     *
     * @return array{goal: int, response_minutes: int, resolve: list<array{type: string, hours: ?int, clock: ?string}>}
     */
    private static function slaRules(): array
    {
        $byType = TicketSla::rules()[SlaScope::RequestType->value] ?? [];

        return [
            'goal' => TicketSla::goalPercent(),
            'response_minutes' => TicketSla::responseMinutes(),
            'resolve' => array_map(fn (RequestType $type) => [
                'type' => $type->value,
                'hours' => $byType[$type->value]['hours'] ?? null,
                'clock' => isset($byType[$type->value]) ? $byType[$type->value]['clock']->value : null,
            ], RequestType::cases()),
        ];
    }

    /**
     * Anyone who has held a ticket opened from a request.
     *
     * @return list<array<string, mixed>>
     */
    private static function assigneeOptions(): array
    {
        $ids = Ticket::query()->where('source', TicketSource::AutoRequest->value)->whereNotNull('assignee_id')->distinct()->pluck('assignee_id');

        return User::query()->whereIn('id', $ids)->orderBy('name')->get(['id', 'name'])
            ->map(fn (User $u) => ['value' => $u->id, 'label' => $u->name, 'label_th' => null])->all();
    }
}
