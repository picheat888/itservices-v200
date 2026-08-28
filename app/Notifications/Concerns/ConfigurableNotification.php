<?php

namespace App\Notifications\Concerns;

use App\Support\NotificationCatalogue;

/**
 * Makes an in-app notification switchable from the Settings page.
 *
 * `via()` is the one place worth doing this: returning an empty array stops the
 * notification at the framework, so every send site is covered by one check per class
 * rather than a guard repeated at the fifteen places that raise a notification. Whether the
 * recipient SHOULD hear it stays a permission question at the send site — this only
 * answers whether the notification rings for anybody at all.
 *
 * A class that carries several messages (one per subtype) reports the key for the payload
 * it is about to write, so an administrator can silence the daily "still waiting" reminder
 * while keeping the first "waiting on you".
 */
trait ConfigurableNotification
{
    /** The NotificationCatalogue key this instance would produce — the SPA's own message key. */
    abstract protected function notificationKey(): string;

    /**
     * @return list<string>
     *
     * No notification in this application is queued, so the switch read here happens in the
     * same short-lived process that raised the event — a web request or an artisan command.
     * A notification that ever becomes ShouldQueue must not keep the per-process switch cache.
     */
    public function via(object $notifiable): array
    {
        $key = $this->notificationKey();
        if (! NotificationCatalogue::enabled($key)) {
            return [];
        }

        NotificationCatalogue::stampSent($key);

        return ['database'];
    }
}
