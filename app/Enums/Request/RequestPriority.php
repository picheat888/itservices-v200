<?php

namespace App\Enums\Request;

/**
 * Requester-declared priority of a service request. Deliberately separate from
 * TicketPriority (which carries a 4th `critical` level owned by IT staff).
 */
enum RequestPriority: string
{
    case Low = 'low';
    case Medium = 'medium';
    case High = 'high';
}
