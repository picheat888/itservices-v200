<?php

namespace App\Notifications;

use App\Models\Report\ReportSchedule;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/**
 * In-app (database) bell telling the owner of a scheduled report that a run did not go out —
 * the file could not be built, the mail was refused, the template is switched off, or they
 * lost access to the report (the schedule pauses itself). Raised by ReportScheduleService.
 */
class ReportScheduleNotification extends Notification
{
    use ConfigurableNotification;

    public function __construct(private readonly ReportSchedule $schedule) {}

    protected function notificationKey(): string
    {
        return 'notif_report_schedule_failed';
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'report_schedule',
            'subtype' => 'failed',
            'report_schedule_id' => $this->schedule->id,
            'report_key' => $this->schedule->report_key,
            'error' => $this->schedule->last_error,
        ];
    }
}
