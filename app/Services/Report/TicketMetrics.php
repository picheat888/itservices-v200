<?php

namespace App\Services\Report;

use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use Carbon\CarbonInterface;

/**
 * Per-ticket measurements shared by the ticket reports, their row resource and their
 * exports — one definition of "resolve time" and "met SLA" for every caller.
 */
final class TicketMetrics
{
    /** Calendar hours from opening to resolution, one decimal; null while unresolved. */
    public static function resolveHours(Ticket $ticket): ?float
    {
        if ($ticket->created_at === null || $ticket->resolved_at === null) {
            return null;
        }

        return round($ticket->created_at->diffInMinutes($ticket->resolved_at, true) / 60, 1);
    }

    /**
     * The deadline the ticket is running against now: first response while it waits to be
     * taken, resolution afterwards. Same rule as the ticket list's SLA filter.
     */
    public static function activeDue(Ticket $ticket): ?CarbonInterface
    {
        return $ticket->status === TicketStatus::Open && $ticket->responded_at === null
            ? $ticket->sla_response_due_at
            : $ticket->sla_resolve_due_at;
    }

    /** 'met' | 'breached' | null (no deadline to measure against, or canceled). */
    public static function slaState(Ticket $ticket, CarbonInterface $now): ?string
    {
        if ($ticket->status === TicketStatus::Completed) {
            if ($ticket->resolved_at === null || $ticket->sla_resolve_due_at === null) {
                return null;
            }

            return $ticket->resolved_at->lte($ticket->sla_resolve_due_at) ? 'met' : 'breached';
        }

        if (in_array($ticket->status, TicketStatus::live(), true)) {
            $due = self::activeDue($ticket);

            return $due !== null && $due->lt($now) ? 'breached' : null;
        }

        return null;
    }
}
