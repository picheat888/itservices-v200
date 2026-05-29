<?php

namespace App\Enums;

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
}
