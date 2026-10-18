<?php

// Closes a case and settles the request it came from in one transaction; bells and mail only after commit.

namespace App\Services\Ticket;

use App\Models\AuditLog;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Services\Request\RequestService;
use Illuminate\Support\Facades\DB;

class TicketClosureService
{
    public function __construct(
        private readonly TicketService $tickets,
        private readonly RequestService $requests,
    ) {}

    public function close(Ticket $ticket, User $actor, bool $complete, string $resolution): Ticket
    {
        $settled = DB::transaction(function () use ($ticket, $actor, $complete, $resolution): ?array {
            $this->tickets->closeRow($ticket, $complete, $resolution);

            return $this->requests->settleRowsFromTicket($ticket, $actor, $complete, $resolution);
        });
        $ticket->refresh();

        // The close is committed; a failed bell or mail is logged rather than reported as a failed close
        rescue(fn () => AuditLog::record('Resolved ticket', "{$ticket->ticket_no} → {$ticket->status?->value}", subject: $ticket));
        rescue(fn () => $this->tickets->announceClosed($ticket, $complete));
        if ($settled !== null) {
            rescue(fn () => $this->requests->announceSettledFromTicket($ticket, $complete, $settled));
        }

        return $ticket;
    }
}
