<?php

// Queued Web Push that carries one bell's payload to the notifiable's browsers (or to the routes given for a test push).

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;

class WebPushRelay extends Notification implements ShouldQueue
{
    use Queueable;

    public const TTL_SECONDS = 86400;

    /** @param array<string, mixed> $payload */
    public function __construct(private readonly array $payload) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return [WebPushChannel::class];
    }

    public function toWebPush(object $notifiable, Notification $notification): WebPushMessage
    {
        return (new WebPushMessage)
            ->data($this->payload)
            ->options(['TTL' => self::TTL_SECONDS]);
    }
}
