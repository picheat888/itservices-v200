<?php

// After a bell is stored for a user who has push subscriptions, queues a Web Push relay of that bell (best effort, never throws).

namespace App\Listeners;

use App\Models\User;
use App\Notifications\WebPushRelay;
use App\Support\WebPushPayload;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Notifications\Events\NotificationSent;

class RelayBellToWebPush
{
    public function handle(NotificationSent $event): void
    {
        rescue(fn () => $this->relay($event), report: true);
    }

    private function relay(NotificationSent $event): void
    {
        $user = $event->notifiable;
        if ($event->channel !== 'database' || ! $user instanceof User || ! $user->pushSubscriptions()->exists()) {
            return;
        }

        $bell = $event->response instanceof DatabaseNotification
            ? $event->response
            : DatabaseNotification::find($event->response?->id ?? null);
        if ($bell === null) {
            return;
        }

        $user->notify(new WebPushRelay(WebPushPayload::for($bell, $user)));
    }
}
