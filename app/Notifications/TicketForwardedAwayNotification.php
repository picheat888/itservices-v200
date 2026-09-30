<?php

namespace App\Notifications;

use App\Models\Ticket\Ticket;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/**
 * In-app bell for the technician who HAD a case when somebody else (a dispatcher) forwarded
 * it on — the other half of TicketForwardedNotification. Without it the case simply left
 * their list with nothing to say where it went.
 */
class TicketForwardedAwayNotification extends Notification
{
    use ConfigurableNotification;

    public function __construct(
        private readonly Ticket $ticket,
        private readonly string $toName,
        private readonly ?string $byName,
    ) {}

    protected function notificationKey(): string
    {
        return 'notif_ticket_forwarded_away';
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'ticket_forwarded_away',
            'ticket_id' => $this->ticket->id,
            'ticket_no' => $this->ticket->ticket_no,
            'subject' => $this->ticket->subject,
            'to' => $this->toName,
            'by' => $this->byName,
        ];
    }
}
