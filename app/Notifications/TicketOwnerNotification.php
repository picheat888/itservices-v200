<?php

namespace App\Notifications;

use App\Models\Ticket\Ticket;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/**
 * In-app bell for the case OWNER (the requester) whenever their case moves:
 * `taken` (someone is now responsible — covers both take and assign),
 * `forwarded` (responsibility moved to another staff), `resolved` (closed
 * successfully) or `cancelled`. `$by` names the responsible staff where relevant.
 */
class TicketOwnerNotification extends Notification
{
    use ConfigurableNotification;

    public function __construct(
        private readonly Ticket $ticket,
        private readonly string $event,
        private readonly ?string $by = null,
    ) {}

    protected function notificationKey(): string
    {
        return 'notif_ticket_owner_'.$this->event;
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'ticket_owner',
            'event' => $this->event,
            'ticket_id' => $this->ticket->id,
            'ticket_no' => $this->ticket->ticket_no,
            'subject' => $this->ticket->subject,
            'by' => $this->by,
        ];
    }
}
