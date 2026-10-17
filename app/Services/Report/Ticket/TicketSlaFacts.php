<?php

namespace App\Services\Report\Ticket;

use App\Enums\Ticket\TicketStatus;
use App\Models\Request\ServiceRequest;
use App\Services\Report\TicketMetrics;
use Illuminate\Database\Eloquent\Builder;

/**
 * The SLA summary reports' per-ticket facts as plain arrays (epoch seconds, no models, no Carbon):
 * one lean query, each verdict worked out once, then the tallies read the arrays. The same rules as
 * TicketMetrics::slaState / activeDue and the reports' take/close verdicts.
 *
 * @phpstan-type Fact array{id: int, no: string, cat: string, prio: ?string, wc: ?string, status: string, assignee: ?int, created: ?int, taken: ?int, resolved: ?int, rdue: ?int, sdue: ?int, type: ?string, take: ?string, close: ?string, over: bool}
 */
final class TicketSlaFacts
{
    /**
     * The facts of the tickets a query keeps, in the query's order. `$withRequestType` adds the type of
     * the request a ticket was opened from.
     *
     * @return list<array<string, mixed>>
     */
    public static function load(Builder $query, bool $withRequestType = false): array
    {
        $columns = ['tickets.id', 'tickets.ticket_no', 'tickets.category', 'tickets.priority', 'tickets.work_class', 'tickets.status', 'tickets.assignee_id',
            'tickets.created_at', 'tickets.responded_at', 'tickets.resolved_at', 'tickets.sla_response_due_at', 'tickets.sla_resolve_due_at'];

        $lean = $query->setEagerLoads([])->select($columns);
        if ($withRequestType) {
            $lean->addSelect(['request_type' => ServiceRequest::query()->select('type')->whereColumn('service_requests.ticket_id', 'tickets.id')->limit(1)]);
        }

        $now = now();
        $nowSeconds = $now->getTimestamp();
        // A deadline is past once it is before now; whole-second deadlines compare against the next second when now has microseconds.
        $cut = $nowSeconds + ($now->micro > 0 ? 1 : 0);
        $live = TicketStatus::liveValues();
        $completed = TicketStatus::Completed->value;
        $open = TicketStatus::Open->value;
        $at = fn (?string $value) => $value === null ? null : strtotime($value);

        $facts = [];
        foreach ($lean->toBase()->get() as $row) {
            $taken = $at($row->responded_at);
            $resolved = $at($row->resolved_at);
            $rdue = $at($row->sla_response_due_at);
            $sdue = $at($row->sla_resolve_due_at);
            $isLive = in_array($row->status, $live, true);

            $take = null;
            if ($rdue !== null) {
                $take = $taken !== null ? ($taken <= $rdue ? 'met' : 'missed') : ($isLive && $rdue < $cut ? 'over' : null);
            }

            if ($row->status === $completed) {
                $close = $resolved === null || $sdue === null ? null : ($resolved <= $sdue ? 'met' : 'missed');
            } else {
                $running = $isLive && ! ($row->status === $open && $taken === null);
                $close = $running && $sdue !== null && $sdue < $cut ? 'over' : null;
            }

            $facts[] = [
                'id' => (int) $row->id,
                'no' => $row->ticket_no,
                'cat' => $row->category,
                'prio' => $row->priority,
                'wc' => $row->work_class,
                'status' => $row->status,
                'assignee' => $row->assignee_id === null ? null : (int) $row->assignee_id,
                'created' => $at($row->created_at),
                'taken' => $taken,
                'resolved' => $resolved,
                'rdue' => $rdue,
                'sdue' => $sdue,
                'type' => $row->request_type ?? null,
                'take' => $take,
                'close' => $close,
                'over' => $take === 'over' || $close === 'over',
            ];
        }

        return $facts;
    }

    /**
     * Counts and averages over a set of facts — the one tally the tiles, the grouped lines and the file read.
     * `$takeFromCompleted`: the wait is averaged over completed cases (request report) instead of every case taken in time or late;
     * `$withWork` adds the taking-to-closing average.
     *
     * @param  list<array<string, mixed>>  $facts
     * @return array<string, int|float|null>
     */
    public static function tally(array $facts, bool $takeFromCompleted = false, bool $withWork = false): array
    {
        $completed = TicketStatus::Completed->value;
        $canceled = TicketStatus::Canceled->value;
        $live = TicketStatus::liveValues();

        $n = ['total' => 0, 'completed' => 0, 'canceled' => 0, 'open' => 0, 'take_met' => 0, 'take_total' => 0, 'close_met' => 0, 'close_total' => 0, 'over_now' => 0, 'over_untaken' => 0, 'over_taken' => 0];
        $takeSum = $fixSum = $workSum = 0;
        $takeCount = $fixCount = $workCount = 0;

        foreach ($facts as $f) {
            $n['total']++;
            $isCompleted = $f['status'] === $completed;
            $isCompleted && $n['completed']++;
            $f['status'] === $canceled && $n['canceled']++;
            in_array($f['status'], $live, true) && $n['open']++;

            $take = $f['take'];
            $close = $f['close'];
            $take === 'met' && $n['take_met']++;
            ($take === 'met' || $take === 'missed') && $n['take_total']++;
            $close === 'met' && $n['close_met']++;
            ($close === 'met' || $close === 'missed') && $n['close_total']++;
            $f['over'] && $n['over_now']++;
            $take === 'over' && $n['over_untaken']++;
            $close === 'over' && $n['over_taken']++;

            $counted = $takeFromCompleted ? $isCompleted && $f['taken'] !== null : ($take === 'met' || $take === 'missed');
            if ($counted) {
                // Unrounded until the average, so a 20-minute take still reads 20 minutes (not 0.3 h = 18).
                $takeSum += self::hours($f['created'], $f['taken']);
                $takeCount++;
            }
            if ($isCompleted) {
                $fix = self::fixHours($f);
                if ($fix !== null) {
                    $fixSum += $fix;
                    $fixCount++;
                }
                if ($withWork && $f['taken'] !== null && $f['resolved'] !== null) {
                    $workSum += self::hours($f['taken'], $f['resolved']);
                    $workCount++;
                }
            }
        }

        $out = $n + [
            'take_avg_hours' => $takeCount === 0 ? null : round($takeSum / $takeCount, 2),
            'fix_avg_hours' => $fixCount === 0 ? null : round($fixSum / $fixCount, 1),
        ];
        if ($withWork) {
            $out['work_avg_hours'] = $workCount === 0 ? null : round($workSum / $workCount, 1);
        }

        return self::inOrder($out, $withWork);
    }

    /** Calendar hours between two moments, unrounded. */
    public static function hours(int $from, int $to): float
    {
        return abs($to - $from) / 60 / 60;
    }

    /** Hours from opening to resolution, one decimal (TicketMetrics::resolveHours); null while unresolved. */
    public static function fixHours(array $fact): ?float
    {
        return $fact['created'] === null || $fact['resolved'] === null ? null : round(self::hours($fact['created'], $fact['resolved']), 1);
    }

    /** Hours a completed case closed past its resolve deadline, one decimal; null when it was in time. */
    public static function lateHours(array $fact): ?float
    {
        if ($fact['close'] !== 'missed' || $fact['resolved'] === null || $fact['sdue'] === null) {
            return null;
        }

        return round(self::hours($fact['sdue'], $fact['resolved']), 1);
    }

    /** The deadline the case runs against now (TicketMetrics::activeDue), as epoch seconds. */
    public static function activeDue(array $fact): ?int
    {
        return $fact['status'] === TicketStatus::Open->value && $fact['taken'] === null ? $fact['rdue'] : $fact['sdue'];
    }

    /** One line of the "still open past SLA" list; the caller adds the report's own columns. */
    public static function overLine(array $fact): array
    {
        $due = self::activeDue($fact);
        $now = now();

        return [
            'id' => $fact['id'],
            'ticket_no' => $fact['no'],
            'due_at' => $due === null ? null : date('Y-m-d H:i', $due),
            'over_hours' => $due === null ? null : round(abs($now->getTimestamp() - $due + $now->micro / 1_000_000) / 60 / 60, 1),
        ];
    }

    /**
     * How late the late closes were: a count per band, the median, and how many missed by under eight hours.
     *
     * @param  list<array<string, mixed>>  $facts
     * @return array{total: int, bands: list<array{key: string, n: int}>, median_hours: ?float, near: int}
     */
    public static function lateness(array $facts): array
    {
        $late = array_values(array_filter(array_map(fn (array $f) => self::lateHours($f), $facts), fn (?float $h) => $h !== null));
        sort($late);

        return [
            'total' => count($late),
            'bands' => array_map(fn (array $b) => [
                'key' => $b[0],
                'n' => count(array_filter($late, fn (float $h) => $h >= $b[1] && ($b[2] === null || $h < $b[2]))),
            ], TicketManualSlaReport::LATE_BANDS),
            'median_hours' => TicketMetrics::percentile(collect($late), 0.5),
            'near' => count(array_filter($late, fn (float $h) => $h < 8)),
        ];
    }

    /** The tally's keys in the order the reports always returned them. */
    private static function inOrder(array $t, bool $withWork): array
    {
        $keys = ['total', 'completed', 'canceled', 'open', 'take_met', 'take_total', 'close_met', 'close_total', 'take_avg_hours', 'fix_avg_hours'];
        if ($withWork) {
            $keys[] = 'work_avg_hours';
        }
        array_push($keys, 'over_now', 'over_untaken', 'over_taken');

        $ordered = [];
        foreach ($keys as $key) {
            $ordered[$key] = $t[$key];
        }

        return $ordered;
    }
}
