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
 * "SLA ตามประเภทคำขอ" (Report Center → Tickets, /reports/tickets-request-sla): the tickets the
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
        return 'SLA ตามประเภทคำขอ';
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
            ->with(['serviceRequest:id,ticket_id,reference,type', 'assignee:id,name'])
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
            ReportColumn::number('fix_hours', 'เวลาแก้ไข (ชม.)', fn (Ticket $t) => $t->status === TicketStatus::Completed ? TicketMetrics::resolveHours($t) : null),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $tally = self::tally((clone $query)->setEagerLoads([])->get());
        $goal = TicketSla::goalPercent();

        return [
            ReportSummary::make('rs_total', 'Ticket จากคำขอ', $tally['total'])->withSplit([
                ['key' => 'completed', 'label_key' => 'rep_rs_completed', 'tone' => 'green', 'value' => $tally['completed']],
                ['key' => 'canceled', 'label_key' => 'rep_rs_canceled', 'tone' => 'gray', 'value' => $tally['canceled']],
                ['key' => 'open', 'label_key' => 'rep_rs_open', 'tone' => 'blue', 'value' => $tally['open']],
            ]),
            ReportSummary::make('rs_close_rate', 'ปิดทัน SLA (%)', self::percent($tally['close_met'], $tally['close_total']), null, 'percent')
                ->withGoal($goal)
                ->withNote(['label_key' => 'rep_rs_note_close', 'values' => ['met' => $tally['close_met'], 'n' => $tally['close_total']]]),
            ReportSummary::make('rs_take_rate', 'รับเคสทัน SLA (%)', self::percent($tally['take_met'], $tally['take_total']), null, 'percent')
                ->withGoal($goal)
                ->withNote(['label_key' => 'rep_rs_note_take', 'values' => ['met' => $tally['take_met'], 'n' => $tally['take_total']]]),
            ReportSummary::make('rs_fix_avg', 'เวลาแก้ไขโดยเฉลี่ย (ชม.)', $tally['fix_avg_hours'], null, 'hours')
                ->withNote($tally['take_avg_hours'] === null ? null : ['label_key' => 'rep_rs_note_take_avg', 'hours' => $tally['take_avg_hours']]),
            ReportSummary::make('rs_over_sla', 'เกิน SLA ตอนนี้', $tally['over_now'], 'red'),
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
            ->filter(fn (Ticket $t) => self::closeState($t) === 'over')
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
                'เวลารับเคสโดยเฉลี่ย (ชม.)', 'เวลาแก้ไขโดยเฉลี่ย (ชม.)',
            ],
            'rows' => $rows,
        ]];
    }

    /**
     * Counts and averages over a set of tickets — the one tally the summary tiles, the per-type
     * lines and the file all read.
     *
     * @param  Collection<int, Ticket>  $tickets
     * @return array{total: int, completed: int, canceled: int, open: int, take_met: int, take_total: int, close_met: int, close_total: int, take_avg_hours: ?float, fix_avg_hours: ?float, over_now: int}
     */
    private static function tally(Collection $tickets): array
    {
        $take = $tickets->map(fn (Ticket $t) => self::takeState($t));
        $close = $tickets->map(fn (Ticket $t) => self::closeState($t));
        $takeHours = $tickets->filter(fn (Ticket $t) => in_array(self::takeState($t), ['met', 'missed'], true))
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
            'over_now' => $close->filter(fn (?string $s) => $s === 'over')->count(),
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
     * Closing the case — TicketMetrics::slaState read for this page: a completed case is in time
     * or late; a live one past its current deadline is "over"; canceled ones are not judged.
     */
    private static function closeState(Ticket $ticket): ?string
    {
        $state = TicketMetrics::slaState($ticket, now());

        return match (true) {
            $state === 'met' => 'met',
            $state === 'over_sla' && $ticket->status === TicketStatus::Completed => 'missed',
            $state === 'over_sla' => 'over',
            default => null,
        };
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
