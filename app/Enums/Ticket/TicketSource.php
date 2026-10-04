<?php

namespace App\Enums\Ticket;

/**
 * Where a ticket came from — stored on tickets.source so reports can tell the two apart
 * without joining service_requests.
 *
 * Manual  — someone opened it on the Ticket page (or IT on their behalf).
 * AutoRequest — opened by the system when an approved service request asks for one
 *               (RequestService, auto_ticket); that request's ticket_id points back here.
 */
enum TicketSource: string
{
    case Manual = 'manual';
    case AutoRequest = 'auto_request';
}
