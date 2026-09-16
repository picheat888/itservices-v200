<?php

namespace App\Enums\Ticket;

/**
 * Lifecycle state of a support ticket.
 *
 * Open → (IT takes/assigns) → InProgress → (assignee resolves) → Completed / Canceled
 */
enum TicketStatus: string
{
    case Open = 'open';                 // submitted, awaiting an IT staff to pick it up
    case InProgress = 'in_progress';    // taken by / assigned to an IT staff
    case Completed = 'completed';       // resolved successfully and closed
    case Canceled = 'canceled';         // closed without resolution

    /**
     * Every state where the case is still somebody's problem.
     *
     * Named rather than spelled out at each call site: seventeen places asked "open or in
     * progress?" by hand, and a list written out by hand is a list that gets one member added
     * in sixteen of them.
     *
     * @return list<self>
     */
    public static function live(): array
    {
        return [self::Open, self::InProgress];
    }

    /**
     * The same set as plain strings, for query builders that compare against the column.
     *
     * @return list<string>
     */
    public static function liveValues(): array
    {
        return array_map(fn (self $status) => $status->value, self::live());
    }

    /**
     * Taken by somebody and not yet closed — the states an assignee can act on.
     *
     * @return list<self>
     */
    public static function working(): array
    {
        return [self::InProgress];
    }
}
