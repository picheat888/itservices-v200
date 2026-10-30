<?php

// In-app (database) bell telling SLA settings owners that a year has no company holidays yet.

namespace App\Notifications;

use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

class SlaHolidaysMissingNotification extends Notification
{
    use ConfigurableNotification;

    public const UPCOMING = 'upcoming';

    public const STARTED = 'started';

    public function __construct(private readonly int $year, private readonly string $subtype) {}

    protected function notificationKey(): string
    {
        return 'notif_sla_holidays_missing';
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'sla_holidays',
            'subtype' => $this->subtype,
            'year' => $this->year,
        ];
    }
}
