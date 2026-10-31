<?php

namespace App\Support;

use App\Enums\Ticket\SlaScope;
use App\Enums\Ticket\TicketSlaClock;
use App\Enums\Ticket\TicketStatus;
use App\Enums\Ticket\TicketWorkClass;
use App\Models\Settings\AppSetting;
use App\Models\Settings\SlaHoliday;
use App\Models\Settings\SlaTarget;
use App\Models\Ticket\Ticket;
use BackedEnum;
use Carbon\Carbon;

/** SLA targets and clocks from Settings → Tickets: one response target on working time, resolution targets by rule precedence. */
class TicketSla
{
    /** Storage key for the saved per-priority resolution map. */
    public const KEY = 'ticket_sla';

    /** Storage key for the single first-response target (minutes). */
    public const RESPONSE_KEY = 'ticket_sla_response';

    /** Storage key for the SLA goal: the share of cases that should close within target (%). */
    public const GOAL_KEY = 'ticket_sla_goal';

    /** Default SLA goal: 90% of cases closed within their target. */
    public static function goalDefault(): int
    {
        return 90;
    }

    /** The SLA goal the reports hold the met-rate against; a missing or out-of-range value reads as the default. */
    public static function goalPercent(): int
    {
        $stored = (int) AppSetting::get(self::GOAL_KEY, (string) self::goalDefault());

        return $stored >= 1 && $stored <= 100 ? $stored : self::goalDefault();
    }

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
     * Per-priority resolution targets and clocks, saved rows over the defaults (Settings shows the clock back).
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
     * Default working window: Mon–Fri 08:00–17:00 with a 12:00–13:00 break (break_* null = no break); OT is not counted.
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
     * Saved working window over the defaults; an unusable one falls back so the walkers cannot loop forever.
     *
     * @return array{days: list<int>, start: string, end: string, break_start: ?string, break_end: ?string}
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

        // Break: saved null means none, a missing key means the default lunch, an unusable one is dropped
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

    /** Per-request memo of the listed company holidays. */
    private static ?array $holidayMemo = null;

    /**
     * Listed company holidays, keyed by local date.
     *
     * @return array<string, true>
     */
    public static function holidays(): array
    {
        if (self::$holidayMemo !== null) {
            return self::$holidayMemo;
        }

        $holidays = [];
        foreach (SlaHoliday::query()->get(['date']) as $holiday) {
            $holidays[$holiday->date->toDateString()] = true;
        }

        return self::$holidayMemo = $holidays;
    }

    /** Drop the memoized targets, window and holidays — call after saving new values (and between tests). */
    public static function flush(): void
    {
        self::$memo = null;
        self::$responseMemo = null;
        self::$hoursMemo = null;
        self::$holidayMemo = null;
        self::$rulesMemo = null;
        self::$planMemo = null;
    }

    /** Resolution target (hours) for a priority, falling back to the medium default. */
    public static function resolveHours(?string $priority): int
    {
        $targets = self::targets();

        return $targets[$priority]['resolve'] ?? $targets['medium']['resolve'];
    }

    /** How a repair target is keyed: the ticket's category and who does the work, in one place for writer, reader and forecast. */
    public static function workClassKey(string $category, string $workClass): string
    {
        return "{$category}:{$workClass}";
    }

    /** The "who does the work" half of a workClassKey(); the caller already holds the ticket's category. */
    public static function workClassFromKey(string $key): string
    {
        return str_contains($key, ':') ? explode(':', $key, 2)[1] : $key;
    }

    /**
     * One ticket's resolution target: work class, then request type, then priority, then the code defaults.
     *
     * @return array{hours: int, scope: ?SlaScope, value: ?string, clock: TicketSlaClock}
     */
    public static function targetFor(Ticket $ticket): array
    {
        // match_value stores the plain string, while value() may hand back the cast enum
        $requestType = $ticket->relationLoaded('serviceRequest')
            ? $ticket->serviceRequest?->type
            : $ticket->serviceRequest()->value('type');
        $requestType = $requestType instanceof BackedEnum ? (string) $requestType->value : $requestType;

        return self::targetForValues($requestType, $ticket->category?->value, $ticket->work_class?->value, $ticket->priority?->value);
    }

    /**
     * targetFor() from a ticket's plain column values, for callers that read rows without models.
     *
     * @return array{hours: int, scope: ?SlaScope, value: ?string, clock: TicketSlaClock}
     */
    public static function targetForValues(?string $requestType, ?string $category, ?string $workClassValue, ?string $priority): array
    {
        $rules = self::rules();

        // A repair target belongs to the category and work-class pair; ordinary work matches no pair rule
        $workClass = $workClassValue !== null && TicketWorkClass::from($workClassValue)->isRepair() && $category !== null
            ? self::workClassKey($category, $workClassValue)
            : null;

        $candidates = [
            SlaScope::WorkClass->value => $workClass,
            SlaScope::RequestType->value => $requestType,
            SlaScope::Priority->value => $priority,
        ];

        foreach (SlaScope::precedence() as $scope) {
            $value = $candidates[$scope->value] ?? null;
            $rule = $value === null ? null : ($rules[$scope->value][$value] ?? null);
            if ($rule !== null) {
                return ['hours' => $rule['hours'], 'scope' => $scope, 'value' => $value, 'clock' => $rule['clock']];
            }
        }

        // No rule: the priority default (medium without one), no scope, on business time
        return [
            'hours' => self::resolveHours($priority),
            'scope' => null,
            'value' => null,
            'clock' => TicketSlaClock::Business,
        ];
    }

    /** Per-request memo of the enabled rules, as [scope][match_value] => ['hours', 'clock']. */
    private static ?array $rulesMemo = null;

    /**
     * Every enabled target row, read once per request.
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

    /** Share of the ticket's own target spent (%) at which it turns "near_due"; not the backlog report's 24-hour "due_soon". */
    private const NEAR_DUE_PCT = 80;

    /** Bound on days skipped while looking for the next working day; only a broken config reaches it. */
    private const MAX_SKIPPED_DAYS = 400;

    /** True when the instant's date falls on a configured working day that is not a listed holiday. */
    private static function isWorkDay(Carbon $at): bool
    {
        return in_array($at->isoWeekday(), self::hours()['days'], true)
            && ! isset(self::holidays()[$at->toDateString()]);
    }

    /**
     * The working sub-windows of the instant's own date: one pair, or two when a break splits the day.
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

    /** The first working instant at or after $at, skipping breaks, non-working days and holidays. */
    private static function nextWorkOpen(Carbon $at): Carbon
    {
        $cursor = $at->copy();
        for ($i = 0; $i < self::MAX_SKIPPED_DAYS; $i++) {
            if (self::isWorkDay($cursor)) {
                foreach (self::windowsOf($cursor) as [$start, $end]) {
                    if ($cursor->lessThan($end)) {
                        return $cursor->max($start);
                    }
                }
            }
            $cursor = $cursor->addDay()->startOfDay();
        }

        return $cursor;
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

    /** The instant reached after $minutes of working time from $from; outside the window the clock starts at the next opening. */
    public static function addBusinessMinutes(Carbon $from, int $minutes): Carbon
    {
        return self::addBusinessMinutesFast($from, $minutes) ?? self::addBusinessMinutesWalk($from, $minutes);
    }

    /** Reference walk over Carbon copies; the fast path must agree with it. */
    private static function addBusinessMinutesWalk(Carbon $from, int $minutes): Carbon
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

    /** @var array{days: array<int, true>, holidays: array<int, true>, windows: list<array{0: int, 1: int}>}|null */
    private static ?array $planMemo = null;

    /** @var array<string, bool> */
    private static array $fixedOffsetZones = [];

    /** True when the zone has no clock changes from 2000 to 2100, so wall time and elapsed time agree. */
    private static function hasFixedOffset(\DateTimeZone $zone): bool
    {
        $name = $zone->getName();

        return self::$fixedOffsetZones[$name] ??= count($zone->getTransitions(946684800, 4102444800)) === 1;
    }

    /** The working window as seconds-of-day pairs and holidays as local day numbers, for the arithmetic walk. */
    private static function businessPlan(): array
    {
        if (self::$planMemo !== null) {
            return self::$planMemo;
        }

        $hours = self::hours();
        $secs = fn (string $time): int => (int) substr($time, 0, 2) * 3600 + (int) substr($time, 3, 2) * 60;
        $windows = ($hours['break_start'] ?? null) === null || ($hours['break_end'] ?? null) === null
            ? [[$secs($hours['start']), $secs($hours['end'])]]
            : [[$secs($hours['start']), $secs($hours['break_start'])], [$secs($hours['break_end']), $secs($hours['end'])]];

        $holidays = [];
        foreach (array_keys(self::holidays()) as $date) {
            $holidays[intdiv(strtotime($date.' 00:00:00 UTC'), 86400)] = true;
        }

        return self::$planMemo = ['days' => array_fill_keys($hours['days'], true), 'holidays' => $holidays, 'windows' => $windows];
    }

    /** Local-clock seconds of the first working instant at or after $at (mirrors nextWorkOpen). */
    private static function openAtOrAfter(int $at, array $plan): int
    {
        $cursor = $at;
        for ($i = 0; $i < self::MAX_SKIPPED_DAYS; $i++) {
            $day = intdiv($cursor, 86400);
            $secondOfDay = $cursor - $day * 86400;
            if (isset($plan['days'][($day + 3) % 7 + 1]) && ! isset($plan['holidays'][$day])) {
                foreach ($plan['windows'] as [$start, $end]) {
                    if ($secondOfDay < $end) {
                        return $day * 86400 + max($secondOfDay, $start);
                    }
                }
            }
            $cursor = ($day + 1) * 86400;
        }

        return $cursor;
    }

    /** Local-clock seconds where the window holding $at ends (mirrors currentWindowEnd). */
    private static function windowEndAt(int $at, array $plan): int
    {
        $day = intdiv($at, 86400);
        $secondOfDay = $at - $day * 86400;
        foreach ($plan['windows'] as [$start, $end]) {
            if ($secondOfDay >= $start && $secondOfDay < $end) {
                return $day * 86400 + $end;
            }
        }

        return $at;
    }

    /** addBusinessMinutes() on integer seconds; null when the input needs the Carbon walk instead. */
    private static function addBusinessMinutesFast(Carbon $from, int $minutes): ?Carbon
    {
        $offset = $from->getOffset();
        $local = $from->getTimestamp() + $offset;
        if ($from->micro !== 0 || $local < 0 || ! self::hasFixedOffset($from->getTimezone())) {
            return null;
        }

        return $from->copy()->setTimestamp(self::walkLocalSeconds($local, $minutes) - $offset);
    }

    /** The working-time walk on local-clock seconds: where $minutes of working time from $local ends. */
    private static function walkLocalSeconds(int $local, int $minutes): int
    {
        $plan = self::businessPlan();
        $cursor = self::openAtOrAfter($local, $plan);
        $remaining = max(0, $minutes);

        for ($i = 0; $i < 1460 && $remaining > 0; $i++) {
            $end = self::windowEndAt($cursor, $plan);
            $available = intdiv($end - $cursor, 60);
            if ($remaining <= $available) {
                $cursor += $remaining * 60;
                break;
            }
            $remaining -= $available;
            $cursor = self::openAtOrAfter($end, $plan);
        }

        return $cursor;
    }

    /** addMinutesOn() on whole-second Unix timestamps; zones with clock changes and pre-1970 instants take the Carbon path. */
    public static function addMinutesToTimestamp(int $from, int $minutes, TicketSlaClock $clock): int
    {
        if ($clock === TicketSlaClock::Calendar) {
            return $from + max(0, $minutes) * 60;
        }

        $zone = date_default_timezone_get();
        $fixed = self::$fixedOffsetZones[$zone] ??= count((new \DateTimeZone($zone))->getTransitions(946684800, 4102444800)) === 1;
        $offset = $fixed ? (int) date('Z', $from) : 0;
        if (! $fixed || $from + $offset < 0) {
            return self::addBusinessMinutes(Carbon::createFromTimestamp($from, $zone), $minutes)->getTimestamp();
        }

        return self::walkLocalSeconds($from + $offset, $minutes) - $offset;
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

    /** The instant after $minutes on the rule's clock: calendar counts real time, business counts working time. */
    public static function addMinutesOn(Carbon $from, int $minutes, TicketSlaClock $clock): Carbon
    {
        return $clock === TicketSlaClock::Calendar
            ? $from->copy()->addMinutes(max(0, $minutes))
            : self::addBusinessMinutes($from, $minutes);
    }

    /** Minutes between two instants on the same clock that set the deadline. */
    public static function minutesBetweenOn(Carbon $from, Carbon $to, TicketSlaClock $clock): int
    {
        if ($clock === TicketSlaClock::Calendar) {
            return $to->lessThanOrEqualTo($from) ? 0 : (int) $from->diffInMinutes($to);
        }

        return self::businessMinutesBetween($from, $to);
    }

    /** Where the resolution clock starts: when the case was taken, or its opening time until someone takes it. */
    public static function resolveStart(Ticket $ticket): Carbon
    {
        return $ticket->responded_at ?? $ticket->created_at;
    }

    /** Resolution deadline on the clock of the ticket's target — shared with the dashboard SLA %. */
    public static function resolveDueAt(Ticket $ticket): Carbon
    {
        $target = self::targetFor($ticket);

        return self::addMinutesOn(self::resolveStart($ticket), $target['hours'] * 60, $target['clock']);
    }

    /** Business-time first-response deadline for a ticket — shared with the dashboard SLA %. */
    public static function responseDueAt(Ticket $ticket): Carbon
    {
        return self::addBusinessMinutes($ticket->created_at, self::responseMinutes());
    }

    /**
     * Both SLA clocks of one ticket and the state of the one that matters now; null for canceled tickets.
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
        // The response clock is always business time: one system-wide target, never a rule row
        $responseDue = self::addBusinessMinutes($ticket->created_at, $responseTarget);
        $resolveDue = self::addMinutesOn(self::resolveStart($ticket), $resolveTarget, $clock);

        if ($ticket->status === TicketStatus::Completed && $ticket->resolved_at !== null) {
            $state = $ticket->resolved_at->lessThanOrEqualTo($resolveDue) ? 'met' : 'missed';

            return self::payload($responseDue, $resolveDue, $state, 100, $clock);
        }

        // The running clock: response while open, resolution after that
        $responseActive = $ticket->responded_at === null && $ticket->status === TicketStatus::Open;
        $due = $responseActive ? $responseDue : $resolveDue;
        $total = max(1, $responseActive ? $responseTarget : $resolveTarget);
        // Elapsed time on the same clock and from the same start as the active deadline
        $elapsed = self::minutesBetweenOn(
            $responseActive ? $ticket->created_at : self::resolveStart($ticket),
            now(),
            $responseActive ? TicketSlaClock::Business : $clock,
        );
        $pct = (int) min(100, round(($elapsed / $total) * 100));

        $state = now()->greaterThan($due) ? 'over_sla' : ($pct >= self::NEAR_DUE_PCT ? 'near_due' : 'on_track');

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
