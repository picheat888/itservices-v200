<?php

namespace App\Notifications;

use App\Models\Ticket\Ticket;
use Illuminate\Notifications\Notification;

/**
 * In-app bell alert that a ticket's SLA clock is about to blow (at 80% of the
 * target) or has blown. Subtype encodes clock + severity:
 * response_at_risk | response_breached | resolve_at_risk | resolve_breached.
 */
class TicketSlaAlertNotification extends Notification
{
    public function __construct(
        private readonly Ticket $ticket,
        private readonly string $subtype,
    ) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'ticket_sla',
            'subtype' => $this->subtype,
            'ticket_id' => $this->ticket->id,
            'ticket_no' => $this->ticket->ticket_no,
            'subject' => $this->ticket->subject,
        ];
    }
}
