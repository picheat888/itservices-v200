<?php

namespace App\Notifications;

use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/**
 * In-app (database) bell telling one account its password is about to expire.
 *
 * Raised at sign-in rather than by a scheduled sweep: the deadline is per-account and
 * moves whenever somebody changes their password, so the moment they arrive is both the
 * cheapest time to check and the only time the notice is certain to be seen.
 *
 * Sent to the account itself and to nobody else — unlike every other bell here, there is
 * no permission question to ask, because a password is nobody else's business.
 */
class PasswordExpiringNotification extends Notification
{
    use ConfigurableNotification;

    public function __construct(private readonly int $daysRemaining) {}

    protected function notificationKey(): string
    {
        return 'notif_password_expiring';
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'password_expiring',
            'days_remaining' => $this->daysRemaining,
        ];
    }
}
