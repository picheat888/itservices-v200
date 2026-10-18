<?php

namespace App\Services\Report\Ticket;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketSource;
use App\Enums\Ticket\TicketStatus;
use App\Enums\Ticket\TicketWorkClass;
use App\Models\Ticket\Ticket;
use App\Models\User;
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
 * "สรุปผล SLA ของ Ticket ที่ผู้ใช้เปิดเอง" (Report Center → Tickets, /reports/tickets-manual-sla): the
 * tickets employees opened themselves (tickets.source = manual) — how many, how many were taken in
 * time, how many were closed in time, and how long both took — grouped by a dimension the reader
 * picks: category, priority, kind of work or assignee. The twin of TicketRequestSlaReport, whose
 * one natural grouping (the request type) these tickets do not have.
 *
 * Rows are the tickets, newest first. `breakdown()` (its own endpoint, and the file's grouped
 * sheet) builds the grouped table, the cases still open past SLA, how late the late closes were,
 * and the SLA rules the verdicts used. Verdicts and averages come from TicketSlaVerdicts.
 */
class TicketManualSlaReport extends TabularReport
{
    use TicketReportScope;
    use TicketSlaVerdicts;

    /** The dimensions the grouped table can split by — each one a filter of its own too. */
    public const DIMENSIONS = ['category', 'priority', 'work_class', 'assignee'];

    /** "Not set" for priority (nobody has taken the case yet) and assignee (nobody holds it). */
    public const NONE = 'none';

    /** How late a late close was (hours past the resolve deadline, calendar time): [key, from, to). */
    public const LATE_BANDS = [['under_1h', 0, 1], ['1_8h', 1, 8], ['8_24h', 8, 24], ['1_3d', 24, 72], ['over_3d', 72, null]];

    private const SLA_KEYS = ['met' => 'rep_rs_sla_met', 'missed' => 'rep_rs_sla_missed', 'over' => 'rep_rs_sla_over'];

    private const SLA_TH = ['met' => 'ทัน', 'missed' => 'ไม่ทัน', 'over' => 'เกิน SLA'];

    public function key(): string
    {
        return 'tickets.manual_sla';
    }

    public function title(): string
    {
        return 'สรุปผล SLA ของ Ticket ที่ผู้ใช้เปิดเอง';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfYear()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('category', Options::fromLabels(self::categoryKeys())),
            ReportFilter::select('priority', Options::fromLabels([...self::priorityKeys(), self::NONE => 'rep_ms_prio_none'])),
            ReportFilter::select('work_class', Options::fromLabels(self::workClassKeys())),
            ReportFilter::select('assignee', self::assigneeOptions()),
            // What the grouped table splits by — drawn as a switch on the table, not in the filter bar.
            ReportFilter::select('by', Options::fromLabels(array_combine(self::DIMENSIONS, array_map(fn (string $d) => "rep_ms_by_{$d}", self::DIMENSIONS))), 'category')->viewOnly(),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        return $this->tickets($viewer, $filters)
            ->orderByDesc('tickets.created_at')
            ->orderByDesc('tickets.id');
    }

    /**
     * The tickets the filters keep; `$ignore` drops one dimension's filter so the grouped table can
     * list every group of it, the picked one highlighted among the rest.
     */
    private function tickets(User $viewer, array $filters, ?string $ignore = null): Builder
    {
        [$from, $to] = $this->dayRange($filters);
        $set = fn (string $name) => $name === $ignore ? null : ($filters[$name] ?? null);

        return $this->scopedTickets($viewer, $set('category'))
            ->with([
                'assignee:id,name,employee_id', 'assignee.employee:id,first_name,last_name,first_name_th,last_name_th',
                'requester:id,code,first_name,last_name,first_name_th,last_name_th,department_id', 'requester.department:id,code,name,name_th',
            ])
            ->where('tickets.source', TicketSource::Manual->value)
            ->whereBetween('tickets.created_at', [$from, $to])
            ->when($set('priority'), fn (Builder $q, string $p) => $p === self::NONE ? $q->whereNull('tickets.priority') : $q->where('tickets.priority', $p))
            ->when($set('work_class'), fn (Builder $q, string $w) => $q->where('tickets.work_class', $w))
            ->when($set('assignee'), fn (Builder $q, string|int $a) => $a === self::NONE ? $q->whereNull('tickets.assignee_id') : $q->where('tickets.assignee_id', (int) $a));
    }

    /** @return array<string, string> */
    protected function meanings(): array
    {
        return [
            'opened_month' => 'ปีและเดือนของวันที่แจ้งในรูปแบบ yyyy-mm (ปี ค.ศ.) เป็นข้อความ ใช้จัดกลุ่มหรือทำ Pivot รายเดือน',
            'take_sla' => 'ผลการรับเคสเทียบกับวันที่ครบกำหนด SLA รับเคส (นับเฉพาะเวลาทำการตั้งแต่เวลาที่แจ้ง): ทัน = รับภายในกำหนด, ไม่ทัน = รับหลังกำหนด, เกิน SLA = ยังไม่มีใครรับและเลยกำหนดแล้ว ว่าง = ยังไม่ถึงกำหนด ไม่มีกำหนด หรือยกเลิกก่อนมีคนรับ',
            'take_hours' => 'ชั่วโมงตามปฏิทินจากเวลาที่แจ้งถึงเวลารับเคส รวมนอกเวลาทำการ ทศนิยม 1 ตำแหน่ง ว่าง = ยังไม่มีผู้รับเคส',
            'close_sla' => 'ผลการปิดเคสเทียบกับวันที่ครบกำหนด SLA ปิดเคส (เริ่มนับจากเวลารับเคส ตามนาฬิกาของกฎ SLA ที่เคสเข้าเงื่อนไข): ทัน = เสร็จสิ้นภายในกำหนด, ไม่ทัน = เสร็จสิ้นหลังกำหนด, เกิน SLA = รับแล้วยังไม่เสร็จและเลยกำหนดแล้ว ว่าง = ยกเลิก ยังไม่มีผู้รับ ยังไม่ถึงกำหนด หรือไม่มีกำหนด',
            'fix_hours' => 'ชั่วโมงตามปฏิทินจากเวลาที่แจ้งถึงเวลาปิดเคส ทศนิยม 1 ตำแหน่ง มีค่าเฉพาะเคสสถานะเสร็จสิ้น ว่าง = ยังไม่เสร็จหรือยกเลิก',
            'late_hours' => 'ชั่วโมงตามปฏิทินจากวันที่ครบกำหนด SLA ปิดเคสถึงเวลาปิดเคสจริง ทศนิยม 1 ตำแหน่ง มีค่าเฉพาะเคสที่ปิดไม่ทัน SLA ว่าง = ปิดทัน ยังไม่เสร็จ หรือยกเลิก',
        ];
    }

    public function columns(): array
    {
        return [
            ReportColumn::text('ticket_no', 'เลขที่ Ticket', fn (Ticket $t) => $t->ticket_no)->linkTo('/tickets', fn (Ticket $t) => $t->id),
            // Opened first, as the Ticket & SLA page's list reads.
            ReportColumn::dateTime('opened_at', 'วันที่แจ้ง', fn (Ticket $t) => $t->created_at),
            ReportColumn::text('subject', 'เรื่อง', fn (Ticket $t) => $t->subject),
            ReportColumn::localized('requester', 'ผู้แจ้ง', fn (Ticket $t) => $t->requester ? ['name' => $t->requester->name, 'name_th' => $t->requester->name_th, 'code' => $t->requester->code] : null)
                // "ผู้แจ้ง", as the Ticket & SLA page's list heads it (the shared rep_c_requester reads "ผู้ขอ").
                ->labelKey('rep_col_requester')->withCode('รหัสพนักงานผู้แจ้ง', 'รหัสพนักงานของผู้แจ้ง ใช้เชื่อมกับตารางพนักงาน'),
            ReportColumn::localized('department', 'แผนก', fn (Ticket $t) => ($d = $t->requester?->department) ? ['name' => $d->name, 'name_th' => $d->name_th, 'code' => $d->code] : null)->withCode('รหัสแผนก', 'รหัสแผนกในระบบ ใช้เชื่อมกับตารางแผนกใน Power BI (ชื่อแผนกอาจเปลี่ยนได้ รหัสไม่เปลี่ยน)'),
            ReportColumn::enum('category', 'หมวด', fn (Ticket $t) => $t->category, self::categoryKeys(), self::categoryTh()),
            ReportColumn::enum('priority', 'ความสำคัญ', fn (Ticket $t) => $t->priority, self::priorityKeys(), self::priorityTh()),
            ReportColumn::enum('ticket_status', 'สถานะ', fn (Ticket $t) => $t->status, self::statusKeys(), self::statusTh()),
            ReportColumn::text('assignee', 'ผู้รับผิดชอบ', fn (Ticket $t) => $t->assignee?->name),
            ReportColumn::dateTime('taken_at', 'รับเคสเมื่อ', fn (Ticket $t) => $t->responded_at),
            ReportColumn::enum('take_sla', 'รับเคสทัน SLA', fn (Ticket $t) => self::takeState($t), self::SLA_KEYS, self::SLA_TH),
            ReportColumn::dateTime('closed_at', 'ปิดเคสเมื่อ', fn (Ticket $t) => $t->status === TicketStatus::Completed ? $t->resolved_at : null),
            ReportColumn::enum('close_sla', 'ปิดทัน SLA', fn (Ticket $t) => self::closeState($t), self::SLA_KEYS, self::SLA_TH),
            ReportColumn::number('fix_hours', 'เวลาปิดเคส (ชม.)', fn (Ticket $t) => $t->status === TicketStatus::Completed ? TicketMetrics::resolveHours($t) : null, 1),
            // The Excel sheet only ("ข้อมูลดิบ") — every field for working the cases over in a spreadsheet.
            ReportColumn::text('description', 'รายละเอียด', fn (Ticket $t) => $t->description === null ? null : trim($t->description))->sheetOnly(),
            ReportColumn::enum('work_class', 'ลักษณะงาน', fn (Ticket $t) => $t->work_class, [], self::workClassTh())->sheetOnly(),
            // "2026-09" — a column to pivot the cases by month.
            ReportColumn::text('opened_month', 'เดือนที่แจ้ง', fn (Ticket $t) => $t->created_at?->format('Y-m'))->sheetOnly(),
            ReportColumn::dateTime('canceled_at', 'ยกเลิกเมื่อ', fn (Ticket $t) => $t->status === TicketStatus::Canceled ? $t->resolved_at : null)->sheetOnly(),
            ReportColumn::dateTime('response_due_at', 'วันที่ครบกำหนด SLA รับเคส', fn (Ticket $t) => $t->sla_response_due_at)->sheetOnly(),
            ReportColumn::number('take_hours', 'เวลารอรับเคส (ชม.)', fn (Ticket $t) => TicketMetrics::responseHours($t), 1)->sheetOnly(),
            ReportColumn::dateTime('resolve_due_at', 'วันที่ครบกำหนด SLA ปิดเคส', fn (Ticket $t) => $t->sla_resolve_due_at)->sheetOnly(),
            ReportColumn::number('late_hours', 'ปิดช้ากว่ากำหนด (ชม.)', fn (Ticket $t) => self::lateHours($t), 1)->sheetOnly(),
        ];
    }

    /** @return list<string> */
    protected function sheetOrder(): array
    {
        return [
            'ticket_no', 'subject', 'description', 'category', 'work_class', 'priority',
            'requester', 'department', 'assignee',
            'ticket_status', 'opened_at', 'opened_month', 'taken_at', 'closed_at', 'canceled_at',
            'response_due_at', 'take_sla', 'take_hours',
            'resolve_due_at', 'close_sla', 'fix_hours', 'late_hours',
        ];
    }

    public function countingNotes(array $filters): array
    {
        return [...parent::countingNotes($filters), 'เป้าปิดทัน SLA '.TicketSla::goalPercent().'% ตามที่ตั้งในหน้าตั้งค่า SLA กำหนดรับเคสและปิดเคสนับตามเวลาทำการที่ตั้งไว้ในหน้าเดียวกัน'];
    }

    public function summary(Builder $query, array $filters): array
    {
        $tally = TicketSlaFacts::tally(TicketSlaFacts::load(clone $query), withWork: true);
        $goal = TicketSla::goalPercent();

        return [
            ReportSummary::make('ms_total', 'Ticket ที่ผู้ใช้เปิดเอง', $tally['total'])->withSplit([
                ['key' => 'completed', 'label_key' => 'rep_rs_completed', 'tone' => 'soft-green', 'value' => $tally['completed']],
                ['key' => 'canceled', 'label_key' => 'rep_rs_canceled', 'tone' => 'gray', 'value' => $tally['canceled']],
                ['key' => 'open', 'label_key' => 'rep_rs_open', 'tone' => 'soft-blue', 'value' => $tally['open']],
            ]),
            ReportSummary::make('ms_close_rate', 'ปิดทัน SLA (%)', self::percent($tally['close_met'], $tally['close_total']), null, 'percent')
                ->withGoal($goal)
                ->withNote(['label_key' => 'rep_rs_note_close', 'values' => ['met' => $tally['close_met'], 'n' => $tally['close_total']]]),
            ReportSummary::make('ms_take_rate', 'รับเคสทัน SLA (%)', self::percent($tally['take_met'], $tally['take_total']), null, 'percent')
                ->withGoal($goal)
                ->withNote(['label_key' => 'rep_rs_note_take', 'values' => ['met' => $tally['take_met'], 'n' => $tally['take_total']]]),
            // Where the average time went, as the request report splits it: waiting to be taken (the
            // table's "เวลารับเคสโดยเฉลี่ย", over every case taken), then taking to closing (completed cases).
            ReportSummary::make('ms_fix_avg', 'เวลาปิดเคสเฉลี่ย (ชม.)', $tally['fix_avg_hours'], null, 'hours')
                ->withSplit($tally['take_avg_hours'] === null || $tally['work_avg_hours'] === null ? [] : [
                    ['key' => 'wait', 'label_key' => 'rep_rs_split_wait', 'tone' => 'soft-amber', 'value' => round($tally['take_avg_hours'], 1)],
                    ['key' => 'work', 'label_key' => 'rep_rs_split_work', 'tone' => 'soft-blue', 'value' => $tally['work_avg_hours']],
                ]),
            ReportSummary::make('ms_over_sla', 'เกิน SLA ตอนนี้', $tally['over_now'], 'soft-red')
                ->withShareOf($tally['open'])
                ->withSplit([
                    ['key' => 'untaken', 'label_key' => 'rep_rs_over_untaken', 'tone' => 'soft-red', 'value' => $tally['over_untaken']],
                    ['key' => 'taken', 'label_key' => 'rep_rs_over_taken', 'tone' => 'soft-orange', 'value' => $tally['over_taken']],
                ]),
        ];
    }

    /**
     * What the page draws above the rows: one line per group of the picked dimension (that
     * dimension's own filter set aside, so every group is listed) plus the whole, the cases still
     * open past SLA (most overdue first), how late the late closes were, and the SLA rules.
     *
     * @param  array<string, mixed>  $filters
     * @return array{by: string, groups: list<array<string, mixed>>, overall: array<string, mixed>, open: list<array<string, mixed>>, late: array<string, mixed>, rules: array<string, mixed>}
     */
    public function breakdown(User $viewer, array $filters): array
    {
        $by = in_array($filters['by'] ?? null, self::DIMENSIONS, true) ? $filters['by'] : 'category';
        $facts = TicketSlaFacts::load($this->tickets($viewer, $filters, $by));
        // Assignees are people, named from the data; the other dimensions are translated on the page.
        $people = User::query()->with('employee:id,first_name,last_name,first_name_th,last_name_th')
            ->whereIn('id', array_unique(array_filter(array_column($facts, 'assignee'))))->get(['id', 'name', 'employee_id'])->keyBy('id');
        $names = $people->map(fn (User $u) => $u->name);
        $namesTh = $people->map(fn (User $u) => $u->name_th);

        $groups = collect($facts)
            ->groupBy(fn (array $f) => self::groupKey($f, $by))
            ->map(fn (Collection $group, string $key) => [
                'key' => $key,
                'label' => $by === 'assignee' && $key !== self::NONE ? ($names[$group->first()['assignee']] ?? null) : null,
                'label_th' => $by === 'assignee' && $key !== self::NONE ? ($namesTh[$group->first()['assignee']] ?? null) : null,
                ...TicketSlaFacts::tally($group->all(), withWork: true),
            ])
            ->sortBy(self::groupOrder($by))
            ->values()
            ->all();

        $open = collect($facts)
            ->filter(fn (array $f) => $f['over'])
            ->map(fn (array $f) => [
                'id' => $f['id'],
                'ticket_no' => $f['no'],
                'category' => $f['cat'],
                'assignee' => $names[$f['assignee']] ?? null,
                'assignee_th' => $namesTh[$f['assignee']] ?? null,
                'due_kind' => $f['take'] === 'over' ? 'response' : 'resolve',
                ...array_slice(TicketSlaFacts::overLine($f), 2),
            ])
            ->sortByDesc('over_hours')
            ->values()
            ->all();

        return [
            'by' => $by,
            'groups' => $groups,
            'overall' => TicketSlaFacts::tally($facts, withWork: true),
            'open' => $open,
            'late' => TicketSlaFacts::lateness($facts),
            'rules' => self::slaRules(),
        ];
    }

    /** The file's grouped sheet — the page's table under the dimension the page was split by, then the whole. */
    public function exportSections(User $viewer, array $filters): array
    {
        $breakdown = $this->breakdown($viewer, $filters);
        $line = fn (string $name, array $t) => [
            $name, $t['total'], $t['completed'], $t['canceled'], $t['open'],
            "{$t['take_met']}/{$t['take_total']}", self::percent($t['take_met'], $t['take_total']),
            "{$t['close_met']}/{$t['close_total']}", self::percent($t['close_met'], $t['close_total']),
            $t['take_avg_hours'], $t['fix_avg_hours'],
        ];
        $heading = ['category' => 'หมวด', 'priority' => 'ความสำคัญ', 'work_class' => 'ลักษณะงาน', 'assignee' => 'ผู้รับผิดชอบ'][$breakdown['by']];

        $rows = array_map(fn (array $g) => $line(self::groupLabelTh($breakdown['by'], $g), $g), $breakdown['groups']);
        $rows[] = $line('รวม', $breakdown['overall']);

        return [[
            'title' => "ตาม{$heading}",
            // As on the page: the grouped table lists every group of its own dimension, the filtered one among them.
            ...(filled($filters[$breakdown['by']] ?? null) ? ['note' => "ทุก{$heading} ไม่ขึ้นกับตัวกรอง{$heading}"] : []),
            'headings' => [
                $heading, 'ทั้งหมด', 'เสร็จสิ้น', 'ยกเลิก', 'ยังเปิด',
                'รับเคสทัน SLA (ทัน/รับแล้ว)', 'รับเคสทัน SLA (%)', 'ปิดทัน SLA (ทัน/เสร็จสิ้น)', 'ปิดทัน SLA (%)',
                'เวลารอรับเคสเฉลี่ย (ชม.)', 'เวลาปิดเคสเฉลี่ย (ชม.)',
            ],
            'rows' => $rows,
        ]];
    }

    /** A ticket's group under a dimension; 'none' when that field is not set. */
    private static function groupKey(array $fact, string $by): string
    {
        return match ($by) {
            'category' => $fact['cat'] ?? 'other',
            'priority' => $fact['prio'] ?? self::NONE,
            'work_class' => $fact['wc'] ?? TicketWorkClass::Standard->value,
            'assignee' => $fact['assignee'] === null ? self::NONE : (string) $fact['assignee'],
        };
    }

    /**
     * How the groups line up: priorities and kinds of work in their own order (most urgent first),
     * categories and assignees busiest first — "not set" always last.
     *
     * @return list<\Closure>
     */
    private static function groupOrder(string $by): array
    {
        $fixed = match ($by) {
            'priority' => [...array_map(fn (TicketPriority $p) => $p->value, TicketPriority::cases()), self::NONE],
            'work_class' => array_map(fn (TicketWorkClass $w) => $w->value, TicketWorkClass::cases()),
            default => null,
        };

        return $fixed !== null
            ? [fn (array $a, array $b) => array_search($a['key'], $fixed, true) <=> array_search($b['key'], $fixed, true)]
            : [
                fn (array $a, array $b) => ($a['key'] === self::NONE) <=> ($b['key'] === self::NONE),
                fn (array $a, array $b) => $b['total'] <=> $a['total'],
                fn (array $a, array $b) => strcmp((string) ($a['label'] ?? $a['key']), (string) ($b['label'] ?? $b['key'])),
            ];
    }

    /** A group's name in the file's Thai. */
    private static function groupLabelTh(string $by, array $group): string
    {
        $key = $group['key'];

        return match ($by) {
            'category' => self::categoryTh()[$key] ?? $key,
            'priority' => $key === self::NONE ? 'ยังไม่ประเมิน' : (self::priorityTh()[$key] ?? $key),
            'work_class' => self::workClassTh()[$key] ?? $key,
            'assignee' => $key === self::NONE ? 'ยังไม่มีผู้รับ' : (string) ($group['label'] ?? $key),
        };
    }

    /** Calendar hours a completed case closed past its resolve deadline; null when it was in time. */
    private static function lateHours(Ticket $ticket): ?float
    {
        if (self::closeState($ticket) !== 'missed' || $ticket->resolved_at === null || $ticket->sla_resolve_due_at === null) {
            return null;
        }

        return round($ticket->sla_resolve_due_at->diffInMinutes($ticket->resolved_at, true) / 60, 1);
    }

    /**
     * The SLA the verdicts were measured by: the goal, the one first-response target, each
     * priority's resolution target, and how many repair (work class) rules are set — none means a
     * repair is measured by its priority's target like any other case — and the working window.
     *
     * @return array{goal: int, response_minutes: int, resolve: list<array{priority: string, hours: int, clock: string}>, repair_rules: int, hours: array<string, mixed>}
     */
    private static function slaRules(): array
    {
        return [
            'goal' => TicketSla::goalPercent(),
            'response_minutes' => TicketSla::responseMinutes(),
            'resolve' => array_map(fn (string $p, array $t) => ['priority' => $p, 'hours' => $t['resolve'], 'clock' => $t['clock']], array_keys(TicketSla::targets()), TicketSla::targets()),
            'repair_rules' => count(TicketSla::rules()[SlaScope::WorkClass->value] ?? []),
            // The working window the business-hours clock counts in.
            'hours' => TicketSla::hours(),
        ];
    }

    /** @return array<string, string> */
    private static function workClassKeys(): array
    {
        return array_combine(
            array_map(fn (TicketWorkClass $w) => $w->value, TicketWorkClass::cases()),
            array_map(fn (TicketWorkClass $w) => "rep_ms_work_{$w->value}", TicketWorkClass::cases()),
        );
    }

    /**
     * Anyone who has held a ticket a user opened, after "nobody yet".
     *
     * @return list<array<string, mixed>>
     */
    private static function assigneeOptions(): array
    {
        $ids = Ticket::query()->where('source', TicketSource::Manual->value)->whereNotNull('assignee_id')->distinct()->pluck('assignee_id');

        return [
            ['value' => self::NONE, 'label_key' => 'rep_opt_unassigned'],
            ...User::query()->whereIn('id', $ids)->orderBy('name')->get(['id', 'name'])
                ->map(fn (User $u) => ['value' => $u->id, 'label' => $u->name, 'label_th' => null])->all(),
        ];
    }
}
