<?php

namespace App\Notifications;

use App\Models\Ticket\Ticket;
use Illuminate\Notifications\Notification;

/** In-app bell for IT staff (tickets.resolve + matching Level) when a new case arrives. */
class TicketCreatedNotification extends Notification
{
    public function __construct(private readonly Ticket $ticket) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
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
