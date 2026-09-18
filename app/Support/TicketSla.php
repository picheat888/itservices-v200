<?php

namespace App\Support;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketSlaClock;
use App\Enums\Ticket\TicketStatus;
use App\Models\Settings\AppSetting;
use App\Models\Settings\SlaTarget;
use App\Models\Ticket\Ticket;
use BackedEnum;
use Carbon\Carbon;

/**
 * SLA targets, configurable from Settings → Tickets (stored in app_settings):
 *
 * - First response is ONE system-wide target in minutes (`ticket_sla_response`) —
 *   priority is only assigned when a case is taken, so a per-priority response
 *   target could never guide the queue it is meant for. It always runs on the
 *   business-hours clock (see hours()); it never reads a rule row.
 * - Resolution (close-the-case) target is chosen by precedence — work_class,
 *   then request_type, then priority, then the built-in defaults (see
 *   SlaScope::precedence(), targetFor()) — and each winning rule carries its
 *   own clock: business hours or calendar time (see TicketSlaClock).
 */
class TicketSla
{
    /** Storage key for the saved per-priority resolution map. */
    public const KEY = 'ticket_sla';

    /** Storage key for the single first-response target (minutes). */
    public const RESPONSE_KEY = 'ticket_sla_response';

    /** Default first-response target: 120 working minutes for every case. */
    public static function responseDefault(): int
    {
        return 120;
    }

    /**
     * @return array<string, array{resolve: int}>
     */
    public static function defaults(): array
    {
        return [
            'critical' => ['resolve' => 4],
            'high' => ['resolve' => 8],
            'medium' => ['resolve' => 24],
            'low' => ['resolve' => 72],
        ];
    }

    /** Per-request memo of the merged target map — list pages resolve SLA per row. */
    private static ?array $memo = null;

    /** Per-request memo of the first-response target. */
    private static ?int $responseMemo = null;

    /**
     * Per-priority resolution targets: the saved rows merged over the defaults, so any priority
     * without a row of its own still resolves to a target.
     *
     * Clock rides along here (not just in `rules()`) because this is what Settings -> show()
     * returns for the Priority form — a form that can save a clock per row but never sees it
     * back is a form that cannot round-trip what it just saved.
     *
     * @return array<string, array{resolve: int, clock: string}>
     */
    public static function targets(): array
    {
        if (self::$memo !== null) {
            return self::$memo;
        }

        $stored = self::rules()[SlaScope::Priority->value] ?? [];

        $targets = self::defaults();
        foreach ($targets as $priority => $default) {
            $row = $stored[$priority] ?? null;
            $targets[$priority] = [
                'resolve' => (int) ($row['hours'] ?? $default['resolve']),
                'clock' => ($row['clock'] ?? TicketSlaClock::Business)->value,
            ];
        }

        return self::$memo = $targets;
    }

    /** Storage key for the working-hours window used by the business-time clock. */
    public const HOURS_KEY = 'ticket_sla_hours';

    /**
     * Default SLA working window: Mon–Fri (ISO weekday 1–5), 08:00–17:00 local
     * with a 12:00–13:00 lunch break the clocks skip (break_* null = no break).
     * Occasional OT is deliberately NOT counted — it helps beat the clock instead.
     *
     * @return array{days: list<int>, start: string, end: string, break_start: ?string, break_end: ?string}
     */
    public static function hoursDefaults(): array
    {
        return ['days' => [1, 2, 3, 4, 5], 'start' => '08:00', 'end' => '17:00', 'break_start' => '12:00', 'break_end' => '13:00'];
    }

    /** Per-request memo of the working window. */
    private static ?array $hoursMemo = null;

    /**
     * Saved working window merged over the defaults. An unusable saved value
     * (no days / start not before end) falls back to the defaults so the
     * business-time walkers can never loop forever.
     *
     * @return array{days: list<int>, start: string, end: string}
     */
    public static function hours(): array
    {
        if (self::$hoursMemo !== null) {
            return self::$hoursMemo;
        }

        $stored = json_decode((string) AppSetting::get(self::HOURS_KEY, '{}'), true);
        $stored = is_array($stored) ? $stored : [];

        $defaults = self::hoursDefaults();
        $days = array_values(array_unique(array_filter(
            array_map('intval', (array) ($stored['days'] ?? $defaults['days'])),
            fn (int $d) => $d >= 1 && $d <= 7,
        )));
        $start = self::timeOrNull($stored['start'] ?? $defaults['start']) ?? $defaults['start'];
        $end = self::timeOrNull($stored['end'] ?? $defaults['end']) ?? $defaults['end'];

        if ($days === [] || $start >= $end) {
            return self::$hoursMemo = $defaults;
        }

        // Break: a saved null/'' means "no break" — only a missing key falls back to
        // the default lunch hour. An unusable break (inverted / outside the window)
        // is dropped rather than poisoning the whole window.
        $breakStart = self::timeOrNull(array_key_exists('break_start', $stored) ? $stored['break_start'] : $defaults['break_start']);
        $breakEnd = self::timeOrNull(array_key_exists('break_end', $stored) ? $stored['break_end'] : $defaults['break_end']);
        if ($breakStart === null || $breakEnd === null || $breakStart >= $breakEnd || $breakStart < $start || $breakEnd > $end) {
            $breakStart = $breakEnd = null;
        }

        sort($days);

        return self::$hoursMemo = ['days' => $days, 'start' => $start, 'end' => $end, 'break_start' => $breakStart, 'break_end' => $breakEnd];
    }

    /** "HH:MM" when the value is a well-formed time string, null otherwise. */
    private static function timeOrNull(mixed $value): ?string
    {
        return is_string($value) && preg_match('/^\d{2}:\d{2}$/', $value) ? $value : null;
    }

    /** Drop the memoized targets/window — call after saving new values (and between tests). */
    public static function flush(): void
    {
        self::$memo = null;
        self::$responseMemo = null;
        self::$hoursMemo = null;
        self::$rulesMemo = null;
    }

    /** Resolution target (hours) for a priority, falling back to the medium default. */
    public static function resolveHours(?string $priority): int
    {
        $targets = self::targets();

        return $targets[$priority]['resolve'] ?? $targets['medium']['resolve'];
    }

    /**
     * เป้าหมายปิดเคสของ ticket หนึ่งใบ เป็นชั่วโมง — คำตอบของ "ทำไมเดดไลน์เป็นวันนี้"
     *
     * ลักษณะงาน ชนะ ประเภทคำขอ ชนะ priority ชนะ ค่าเริ่มต้นในโค้ด (ดู SlaScope::precedence)
     *
     * @return array{hours: int, scope: ?SlaScope, value: ?string, clock: TicketSlaClock}
     */
    /**
     * How a repair target is keyed: the ticket's category and who does the work, together.
     *
     * One place rather than a format spelled out at each call site — the settings writer, the
     * rule reader and the forecast all have to agree on it, and a string built by hand in three
     * places is a string that eventually differs in one of them.
     */
    public static function workClassKey(string $category, string $workClass): string
    {
        return "{$category}:{$workClass}";
    }

    public static function targetFor(Ticket $ticket): array
    {
        $rules = self::rules();
        // Builder::value() ใช้ cast ของโมเดล ทั้งสองทางจึงคืน enum ได้ — บีบเป็นสตริงตรงนี้
        // เพราะนั่นคือสิ่งที่ match_value เก็บ
        $requestType = $ticket->relationLoaded('serviceRequest')
            ? $ticket->serviceRequest?->type
            : $ticket->serviceRequest()->value('type');
        $requestType = $requestType instanceof BackedEnum ? (string) $requestType->value : $requestType;

        // เป้าหมายงานซ่อมอยู่ที่ "คู่" ของประเภทเคสกับคนที่ทำ ไม่ใช่ที่คลาสลำพัง — เปลี่ยน
        // mainboard ที่ส่งช่างนอกกับเดินสายเน็ตเวิร์กที่ส่งช่างนอก เป็นงานคนละความยาวกัน
        //
        // งานปกติไม่เข้ากฎไหนเลย ซึ่งคือสิ่งที่ทำให้ scope นี้ชนะลำดับบนสุดได้โดยไม่แอบทับเงียบ ๆ
        $workClass = $ticket->work_class?->isRepair() && $ticket->category !== null
            ? self::workClassKey($ticket->category->value, $ticket->work_class->value)
            : null;

        $candidates = [
            SlaScope::WorkClass->value => $workClass,
            SlaScope::RequestType->value => $requestType,
            SlaScope::Priority->value => $ticket->priority?->value,
        ];

        foreach (SlaScope::precedence() as $scope) {
            $value = $candidates[$scope->value] ?? null;
            $rule = $value === null ? null : ($rules[$scope->value][$value] ?? null);
            if ($rule !== null) {
                return ['hours' => $rule['hours'], 'scope' => $scope, 'value' => $value, 'clock' => $rule['clock']];
            }
        }

        // ไม่มีอะไรตั้งไว้สำหรับเคสนี้: ค่าเริ่มต้นตาม priority และ medium เมื่อยังไม่มี priority
        // รายงานเป็น scope null เพราะไม่มีใครเลือกมัน — และนับด้วยเวลาทำการ ซึ่งคือพฤติกรรมเดิม
        return [
            'hours' => self::resolveHours($ticket->priority?->value),
            'scope' => null,
            'value' => null,
            'clock' => TicketSlaClock::Business,
        ];
    }

    /** memo ของกฎที่เปิดอยู่ต่อ request, เป็น [scope][match_value] => ['hours', 'clock'] */
    private static ?array $rulesMemo = null;

    /**
     * เป้าหมายทุกแถวที่เปิดอยู่ อ่านครั้งเดียวต่อ request
     *
     * หน้ารายการ ticket resolve SLA ทีละแถว และตารางนี้เล็กพอที่ query เดียวจะชนะ
     * การ query ต่อแถวในทุกแง่ที่ควรวัด
     *
     * @return array<string, array<string, array{hours: int, clock: TicketSlaClock}>>
     */
    public static function rules(): array
    {
        if (self::$rulesMemo !== null) {
            return self::$rulesMemo;
        }

        $rules = [];
        foreach (SlaTarget::where('enabled', true)->get() as $target) {
            $rules[$target->scope->value][$target->match_value] = [
                'hours' => $target->resolve_hours,
                'clock' => $target->clock,
            ];
        }

        return self::$rulesMemo = $rules;
    }

    /** The system-wide first-response target in minutes — the same for every case. */
    public static function responseMinutes(): int
    {
        if (self::$responseMemo !== null) {
            return self::$responseMemo;
        }

        $stored = (int) AppSetting::get(self::RESPONSE_KEY, (string) self::responseDefault());

        return self::$responseMemo = ($stored >= 1 ? $stored : self::responseDefault());
    }

    /** Share of the active clock already spent (0–100) at which a ticket turns "at risk". */
    private const AT_RISK_PCT = 80;

    /** True when the instant's date falls on a configured working day. */
    private static function isWorkDay(Carbon $at): bool
    {
        return in_array($at->isoWeekday(), self::hours()['days'], true);
    }

    /**
     * The working sub-windows of the instant's own date — one [start, end] pair,
     * or two when a break splits the day (e.g. 08–12 and 13–17).
     *
     * @return list<array{0: Carbon, 1: Carbon}>
     */
    private static function windowsOf(Carbon $at): array
    {
        $hours = self::hours();
        $start = $at->copy()->setTimeFromTimeString($hours['start']);
        $end = $at->copy()->setTimeFromTimeString($hours['end']);

        if ($hours['break_start'] === null || $hours['break_end'] === null) {
            return [[$start, $end]];
        }

        return [
            [$start, $at->copy()->setTimeFromTimeString($hours['break_start'])],
            [$at->copy()->setTimeFromTimeString($hours['break_end']), $end],
        ];
    }

    /**
     * The first working instant at or after $at: $at itself when inside a
     * sub-window, otherwise the opening of the next one (after the break, or
     * the next working day's morning).
     */
    private static function nextWorkOpen(Carbon $at): Carbon
    {
        $cursor = $at->copy();
        // 8 iterations always reach the next working day (7-day week + same-day check).
        for ($i = 0; $i < 8; $i++) {
            if (self::isWorkDay($cursor)) {
                foreach (self::windowsOf($cursor) as [$start, $end]) {
                    if ($cursor->lessThan($end)) {
                        return $cursor->max($start);
                    }
                }
            }
            $cursor = $cursor->addDay()->startOfDay();
        }

        return $cursor; // unreachable — hours() guarantees at least one working day
    }

    /** End of the sub-window containing $at ($at must come from nextWorkOpen). */
    private static function currentWindowEnd(Carbon $at): Carbon
    {
        foreach (self::windowsOf($at) as [$start, $end]) {
            if ($at->greaterThanOrEqualTo($start) && $at->lessThan($end)) {
                return $end;
            }
        }

        return $at; // defensive — an instant outside every window advances no time
    }

    /**
     * The instant reached after spending $minutes of working time from $from.
     * A ticket filed outside the window starts its clock at the next opening.
     */
    public static function addBusinessMinutes(Carbon $from, int $minutes): Carbon
    {
        $cursor = self::nextWorkOpen($from);
        $remaining = max(0, $minutes);

        // 1460 sub-windows (~2 years of split days) bounds even a low-priority 8760h target.
        for ($i = 0; $i < 1460 && $remaining > 0; $i++) {
            $end = self::currentWindowEnd($cursor);
            $available = (int) $cursor->diffInMinutes($end);
            if ($remaining <= $available) {
                return $cursor->addMinutes($remaining);
            }
            $remaining -= $available;
            $cursor = self::nextWorkOpen($end);
        }

        return $cursor;
    }

    /** Working minutes elapsed between two instants (0 when $to precedes $from). */
    public static function businessMinutesBetween(Carbon $from, Carbon $to): int
    {
        if ($to->lessThanOrEqualTo($from)) {
            return 0;
        }

        $minutes = 0;
        $cursor = self::nextWorkOpen($from);
        for ($i = 0; $i < 1460 && $cursor->lessThan($to); $i++) {
            $end = self::currentWindowEnd($cursor);
            $minutes += (int) $cursor->diffInMinutes($end->min($to));
            $cursor = self::nextWorkOpen($end);
        }

        return $minutes;
    }

    /**
     * เวลาที่ถึงหลังใช้เวลาไป $minutes นับด้วยนาฬิกาที่กฎกำหนด
     *
     * โหมด calendar นับเวลาจริงตรง ๆ เพราะ KPI อย่าง "ซ่อมเสร็จใน 30 วัน" ที่องค์กร
     * ประกาศไว้ ไม่ได้หยุดเดินตอนคนกลับบ้าน
     */
    public static function addMinutesOn(Carbon $from, int $minutes, TicketSlaClock $clock): Carbon
    {
        return $clock === TicketSlaClock::Calendar
            ? $from->copy()->addMinutes(max(0, $minutes))
            : self::addBusinessMinutes($from, $minutes);
    }

    /** เวลาที่ผ่านไประหว่างสองจุด นับด้วยนาฬิกาเรือนเดียวกับที่ตั้งเดดไลน์ */
    public static function minutesBetweenOn(Carbon $from, Carbon $to, TicketSlaClock $clock): int
    {
        if ($clock === TicketSlaClock::Calendar) {
            return $to->lessThanOrEqualTo($from) ? 0 : (int) $from->diffInMinutes($to);
        }

        return self::businessMinutesBetween($from, $to);
    }

    /** เดดไลน์ปิดเคส นับด้วยนาฬิกาที่เป้าหมายของเคสนี้กำหนด — ใช้ร่วมกับ SLA % บน dashboard */
    public static function resolveDueAt(Ticket $ticket): Carbon
    {
        $target = self::targetFor($ticket);

        return self::addMinutesOn($ticket->created_at, $target['hours'] * 60, $target['clock']);
    }

    /** Business-time first-response deadline for a ticket — shared with the dashboard SLA %. */
    public static function responseDueAt(Ticket $ticket): Carbon
    {
        return self::addBusinessMinutes($ticket->created_at, self::responseMinutes());
    }

    /**
     * Snapshot of both SLA clocks for one ticket, or null when SLA doesn't apply
     * (canceled tickets). All math runs on Carbon instants in the app timezone
     * (local wall time, fixed by APP_TIMEZONE) — durations and comparisons are
     * timezone-agnostic either way.
     *
     * - Response clock: created_at → first response (take/assign), one system-wide
     *   target in minutes, always on WORKING TIME (see hours()) — a ticket filed
     *   outside the window starts at the next opening, and the target consumes only
     *   window minutes. The clock starts at submission, before any priority exists,
     *   and never reads a rule row.
     * - Resolution clock: created_at → resolved_at, target chosen by precedence
     *   (work_class → request_type → priority → built-in defaults; tickets without
     *   a priority run against the medium default). The winning rule's own `clock`
     *   decides how time is counted — business hours (window minutes only, like the
     *   response clock) or calendar time (real elapsed minutes, for KPIs such as
     *   "repaired within 30 days" that keep running after hours).
     * - `state` describes the clock that currently matters: the response clock while
     *   the ticket is open, the resolution clock once it's in progress, and the final
     *   met/missed verdict once completed.
     *
     * @return array{response_due_at: string, resolve_due_at: string, state: string, pct_elapsed: int, clock: string}|null
     */
    public static function forTicket(Ticket $ticket): ?array
    {
        if ($ticket->status === TicketStatus::Canceled || $ticket->created_at === null) {
            return null;
        }

        $target = self::targetFor($ticket);
        $clock = $target['clock'];
        $responseTarget = self::responseMinutes();
        $resolveTarget = $target['hours'] * 60;
        // นาฬิกาตอบรับเป็น business เสมอ: เป้าหมายตอบรับเป็นค่าเดียวทั้งระบบ ไม่ได้มาจากแถวกฎ
        $responseDue = self::addBusinessMinutes($ticket->created_at, $responseTarget);
        $resolveDue = self::addMinutesOn($ticket->created_at, $resolveTarget, $clock);

        if ($ticket->status === TicketStatus::Completed && $ticket->resolved_at !== null) {
            $state = $ticket->resolved_at->lessThanOrEqualTo($resolveDue) ? 'met' : 'missed';

            return self::payload($responseDue, $resolveDue, $state, 100, $clock);
        }

        // นาฬิกาที่กำลังเดิน: ตอบรับระหว่างที่ยังเปิด ปิดเคสหลังจากนั้น
        $responseActive = $ticket->responded_at === null && $ticket->status === TicketStatus::Open;
        $due = $responseActive ? $responseDue : $resolveDue;
        $total = max(1, $responseActive ? $responseTarget : $resolveTarget);
        // เวลาที่ผ่านไปต้องนับด้วยนาฬิกาเรือนเดียวกับที่ตั้งเดดไลน์ ไม่งั้นแถบความคืบหน้าจะโกหก
        $elapsed = self::minutesBetweenOn(
            $ticket->created_at,
            now(),
            $responseActive ? TicketSlaClock::Business : $clock,
        );
        $pct = (int) min(100, round(($elapsed / $total) * 100));

        $state = now()->greaterThan($due) ? 'breached' : ($pct >= self::AT_RISK_PCT ? 'at_risk' : 'on_track');

        return self::payload($responseDue, $resolveDue, $state, $pct, $clock);
    }

    /**
     * @return array{response_due_at: string, resolve_due_at: string, state: string, pct_elapsed: int, clock: string}
     */
    private static function payload(Carbon $responseDue, Carbon $resolveDue, string $state, int $pct, TicketSlaClock $clock): array
    {
        return [
            'response_due_at' => $responseDue->toIso8601String(),
            'resolve_due_at' => $resolveDue->toIso8601String(),
            'state' => $state,
            'pct_elapsed' => $pct,
            'clock' => $clock->value,
        ];
    }
}
