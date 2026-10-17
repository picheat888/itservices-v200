<?php

namespace App\Services\Report\Ticket;

use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use App\Services\Report\TicketMetrics;
use WeakMap;

/**
 * The per-ticket SLA verdicts the manual SLA report shows on its rows (the tallies read TicketSlaFacts,
 * which applies the same rules). TicketRequestSlaReport carries its own copy of these two.
 *
 * - taking the case: in time or late against sla_response_due_at once taken; "over" while nobody
 *   has taken it and that deadline has passed;
 * - closing the case: completed cases are in time or late (TicketMetrics::slaState); a live case is
 *   "over" once its resolve deadline has passed — only after it was taken, since the resolve clock
 *   starts then. Canceled cases are not judged.
 */
trait TicketSlaVerdicts
{
    /** 'met' | 'missed' once taken; 'over' while untaken past its response deadline; else null. */
    private static function computeTake(Ticket $ticket): ?string
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
    private static function computeClose(Ticket $ticket): ?string
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

    private static function percent(int $part, int $whole): ?int
    {
        return $whole === 0 ? null : (int) round($part / $whole * 100);
    }

    /** @var WeakMap<Ticket, array<string, mixed>>|null */
    private static ?WeakMap $memo = null;

    // One answer per ticket per request: the tiles, the groups and the late list all ask the same question of it
    private static function once(Ticket $ticket, string $name, callable $compute): mixed
    {
        self::$memo ??= new WeakMap;
        $slot = self::$memo[$ticket] ?? [];
        if (! array_key_exists($name, $slot)) {
            $slot[$name] = $compute();
            self::$memo[$ticket] = $slot;
        }

        return $slot[$name];
    }

    private static function takeState(Ticket $ticket): ?string
    {
        return self::once($ticket, 'take', fn () => self::computeTake($ticket));
    }

    private static function closeState(Ticket $ticket): ?string
    {
        return self::once($ticket, 'close', fn () => self::computeClose($ticket));
    }
}
