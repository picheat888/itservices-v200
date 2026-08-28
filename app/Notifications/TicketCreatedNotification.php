<?php

namespace App\Notifications;

use App\Models\Ticket\Ticket;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/** In-app bell for IT staff (tickets.resolve + matching Level) when a new case arrives. */
class TicketCreatedNotification extends Notification
{
    use ConfigurableNotification;

    public function __construct(private readonly Ticket $ticket) {}

    protected function notificationKey(): string
    {
        return 'notif_ticket_new';
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'ticket_new',
            'ticket_id' => $this->ticket->id,
            'ticket_no' => $this->ticket->ticket_no,
            'subject' => $this->ticket->subject,
        ];
    }
}
