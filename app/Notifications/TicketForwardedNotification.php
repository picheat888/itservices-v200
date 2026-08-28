<?php

namespace App\Notifications;

use App\Models\Ticket\Ticket;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/** In-app bell for the receiving staff when an in-progress case is forwarded to them. */
class TicketForwardedNotification extends Notification
{
    use ConfigurableNotification;

    public function __construct(
        private readonly Ticket $ticket,
        private readonly ?string $fromName,
    ) {}

    protected function notificationKey(): string
    {
        return 'notif_ticket_forwarded';
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'ticket_forwarded',
            'ticket_id' => $this->ticket->id,
            'ticket_no' => $this->ticket->ticket_no,
            'subject' => $this->ticket->subject,
            'from' => $this->fromName,
        ];
    }
}
