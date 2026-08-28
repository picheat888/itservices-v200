<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

/**
 * A one-off copy of a configured notification, sent to whoever pressed Test.
 *
 * Deliberately NOT using ConfigurableNotification: testing a notification that is switched
 * off is exactly when you most want to see it, so this one ignores the switch. It is the
 * only notification in the system that does.
 *
 * The payload carries the key rather than the rendered sentence. The tray already knows how
 * to turn a key into wording in the reader's own language, including an administrator's
 * override — rendering it here would have frozen one language into the row and quietly
 * stopped tracking the very text being tested.
 */
class NotificationTestNotification extends Notification
{
    public function __construct(
        private readonly string $key,
        private readonly string $module,
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
            'type' => 'test',
            // Which notification this is a sample of — the tray renders its name and message from it.
            'source_key' => $this->key,
            // Tabs the row under the module it belongs to, the way a real one would be.
            'module' => $this->module,
        ];
    }
}
