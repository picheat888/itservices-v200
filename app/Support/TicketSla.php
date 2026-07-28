<?php

namespace App\Support;

use App\Enums\Ticket\TicketStatus;
use App\Models\Settings\AppSetting;
use App\Models\Ticket\Ticket;
use Carbon\Carbon;

/**
 * SLA targets, configurable from Settings → Tickets (stored in app_settings):
 *
 * - First response is ONE system-wide target in minutes (`ticket_sla_response`) —
 *   priority is only assigned when a case is taken, so a per-priority response
 *   target could never guide the queue it is meant for.
 * - Resolution (close-the-case) is per priority in hours (`ticket_sla`).
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
     * Saved resolution targets merged over the defaults, so any priority without
     * an explicit override still resolves to a target.
     *
     * @return array<string, array{resolve: int}>
     */
    public static function targets(): array
    {
        if (self::$memo !== null) {
            return self::$memo;
        }

        $stored = json_decode((string) AppSetting::get(self::KEY, '{}'), true);
        $stored = is_array($stored) ? $stored : [];

        $targets = self::defaults();
        foreach ($targets as $priority => $default) {
            $targets[$priority] = [
                'resolve' => (int) ($stored[$priority]['resolve'] ?? $default['resolve']),
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
    }

    /** Resolution target (hours) for a priority, falling back to the medium default. */
    public static function resolveHours(?string $priority): int
    {
        $targets = self::targets();

        return $targets[$priority]['resolve'] ?? $targets['medium']['resolve'];
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

    /** Business-time resolution deadline for a ticket — shared with the dashboard SLA %. */
    public static function resolveDueAt(Ticket $ticket): Carbon
    {
        return self::addBusinessMinutes($ticket->created_at, self::resolveHours($ticket->priority?->value) * 60);
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
     * - Both clocks count WORKING TIME only (see hours()): a ticket filed outside
     *   the window starts at the next opening, and targets consume only window
     *   minutes — e.g. a 4h target filed Friday 16:00 is due Monday morning.
     * - Response clock: created_at → first response (take/assign), one system-wide
     *   target in minutes — the clock starts at submission, before any priority exists.
     * - Resolution clock: created_at → resolved_at, per-priority target in hours
     *   (tickets without a priority run against the medium resolution target).
     * - `state` describes the clock that currently matters: the response clock while
     *   the ticket is open, the resolution clock once it's in progress, and the final
     *   met/missed verdict once completed.
     *
     * @return array{response_due_at: string, resolve_due_at: string, state: string, pct_elapsed: int}|null
     */
    public static function forTicket(Ticket $ticket): ?array
    {
        if ($ticket->status === TicketStatus::Canceled || $ticket->created_at === null) {
            return null;
        }

        $responseTarget = self::responseMinutes();
        $resolveTarget = self::resolveHours($ticket->priority?->value) * 60;
        $responseDue = self::addBusinessMinutes($ticket->created_at, $responseTarget);
        $resolveDue = self::addBusinessMinutes($ticket->created_at, $resolveTarget);

        if ($ticket->status === TicketStatus::Completed && $ticket->resolved_at !== null) {
            $state = $ticket->resolved_at->lessThanOrEqualTo($resolveDue) ? 'met' : 'missed';

            return self::payload($responseDue, $resolveDue, $state, 100);
        }

        // Active clock: response while open (no first response yet), resolution after.
        $responseActive = $ticket->responded_at === null && $ticket->status === TicketStatus::Open;
        $due = $responseActive ? $responseDue : $resolveDue;
        $total = max(1, $responseActive ? $responseTarget : $resolveTarget);
        $elapsed = self::businessMinutesBetween($ticket->created_at, now());
        $pct = (int) min(100, round(($elapsed / $total) * 100));

        $state = now()->greaterThan($due) ? 'breached' : ($pct >= self::AT_RISK_PCT ? 'at_risk' : 'on_track');

        return self::payload($responseDue, $resolveDue, $state, $pct);
    }

    /**
     * @return array{response_due_at: string, resolve_due_at: string, state: string, pct_elapsed: int}
     */
    private static function payload(Carbon $responseDue, Carbon $resolveDue, string $state, int $pct): array
    {
        return [
            'response_due_at' => $responseDue->toIso8601String(),
            'resolve_due_at' => $resolveDue->toIso8601String(),
            'state' => $state,
            'pct_elapsed' => $pct,
        ];
    }
}
