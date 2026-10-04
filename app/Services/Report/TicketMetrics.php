<?php

namespace App\Services\Report;

use App\Enums\Ticket\TicketStatus;
use App\Models\Ticket\Ticket;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

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

    /** Calendar hours from opening to the first response (the case being taken), one decimal; null until then. */
    public static function responseHours(Ticket $ticket): ?float
    {
        if ($ticket->created_at === null || $ticket->responded_at === null) {
            return null;
        }

        return round($ticket->created_at->diffInMinutes($ticket->responded_at, true) / 60, 1);
    }

    /**
     * The first-response verdict: 'met' when the case was taken by its response deadline,
     * 'over_sla' when taken late — or still waiting past it — and null with no deadline to
     * measure, or a case canceled before anyone took it.
     */
    public static function responseSlaState(Ticket $ticket, CarbonInterface $now): ?string
    {
        if ($ticket->sla_response_due_at === null) {
            return null;
        }
        if ($ticket->responded_at !== null) {
            return $ticket->responded_at->lte($ticket->sla_response_due_at) ? 'met' : 'over_sla';
        }

        return in_array($ticket->status, TicketStatus::live(), true) && $ticket->sla_response_due_at->lt($now) ? 'over_sla' : null;
    }

    /**
     * The resolution verdict alone — unlike slaState(), which judges a case still waiting to be
     * taken by its response deadline: 'met' when closed (completed) by the resolve deadline,
     * 'over_sla' when closed late or still open past it, null otherwise (canceled, no deadline,
     * or not due yet).
     */
    public static function resolveSlaState(Ticket $ticket, CarbonInterface $now): ?string
    {
        if ($ticket->sla_resolve_due_at === null) {
            return null;
        }
        if ($ticket->status === TicketStatus::Completed) {
            return $ticket->resolved_at === null ? null : ($ticket->resolved_at->lte($ticket->sla_resolve_due_at) ? 'met' : 'over_sla');
        }

        return in_array($ticket->status, TicketStatus::live(), true) && $ticket->sla_resolve_due_at->lt($now) ? 'over_sla' : null;
    }

    /**
     * Nearest-rank percentile of an ascending list of hours, one decimal; null when empty.
     * The one "median resolve time" of the ticket reports (p = 0.5).
     *
     * @param  Collection<int, float>  $sorted
     */
    public static function percentile(Collection $sorted, float $p): ?float
    {
        if ($sorted->isEmpty()) {
            return null;
        }

        $index = max(0, (int) ceil($p * $sorted->count()) - 1);

        return round((float) $sorted[$index], 1);
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

    /** 'met' | 'over_sla' | null (no deadline to measure against, or canceled). */
    public static function slaState(Ticket $ticket, CarbonInterface $now): ?string
    {
        if ($ticket->status === TicketStatus::Completed) {
            if ($ticket->resolved_at === null || $ticket->sla_resolve_due_at === null) {
                return null;
            }

            return $ticket->resolved_at->lte($ticket->sla_resolve_due_at) ? 'met' : 'over_sla';
        }

        if (in_array($ticket->status, TicketStatus::live(), true)) {
            $due = self::activeDue($ticket);

            return $due !== null && $due->lt($now) ? 'over_sla' : null;
        }

        return null;
    }
}
