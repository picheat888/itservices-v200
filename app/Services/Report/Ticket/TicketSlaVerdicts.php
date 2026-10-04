<?php

namespace App\Services\Report\Ticket;

use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use App\Services\Report\TicketMetrics;
use Illuminate\Support\Collection;

/**
 * The per-ticket SLA verdicts and the tally over a set of tickets that the SLA summary reports
 * read — "สรุปผล SLA ของ Ticket ที่ผู้ใช้เปิดเอง" (TicketManualSlaReport) today. The same rules as
 * TicketRequestSlaReport, which still carries its own copy until it is moved onto this trait.
 *
 * - taking the case: in time or late against sla_response_due_at once taken; "over" while nobody
 *   has taken it and that deadline has passed;
 * - closing the case: completed cases are in time or late (TicketMetrics::slaState); a live case is
 *   "over" once its resolve deadline has passed — only after it was taken, since the resolve clock
 *   starts then. Canceled cases are not judged.
 */
trait TicketSlaVerdicts
{
    /**
     * Counts and averages over a set of tickets — the one tally the summary tiles, the grouped
     * lines and the file all read.
     *
     * @param  Collection<int, Ticket>  $tickets
     * @return array{total: int, completed: int, canceled: int, open: int, take_met: int, take_total: int, close_met: int, close_total: int, take_avg_hours: ?float, fix_avg_hours: ?float, work_avg_hours: ?float, over_now: int, over_untaken: int, over_taken: int}
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
        // From taking the case to closing it, over the completed cases taken.
        $workHours = $tickets->filter(fn (Ticket $t) => $t->status === TicketStatus::Completed && $t->responded_at !== null && $t->resolved_at !== null)
            ->map(fn (Ticket $t) => $t->responded_at->diffInMinutes($t->resolved_at, true) / 60);

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
            'work_avg_hours' => $workHours->isEmpty() ? null : round($workHours->avg(), 1),
            'over_now' => $tickets->filter(fn (Ticket $t) => self::isOverNow($t))->count(),
            'over_untaken' => $take->filter(fn (?string $s) => $s === 'over')->count(),
            'over_taken' => $close->filter(fn (?string $s) => $s === 'over')->count(),
        ];
    }

    /** 'met' | 'missed' once taken; 'over' while untaken past its response deadline; else null. */
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

    /** 'met' | 'missed' for a completed case; 'over' for a taken live case past its resolve deadline; else null. */
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
}
