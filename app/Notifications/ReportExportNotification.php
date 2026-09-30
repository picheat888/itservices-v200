<?php

namespace App\Notifications;

use App\Models\Report\ReportExport;
use App\Notifications\Concerns\ConfigurableNotification;
use Illuminate\Notifications\Notification;

/**
 * In-app (database) bell telling the requester that a queued report file is ready to
 * download — or could not be built. Sent to that person only: a report file is nobody
 * else's business. Raised by App\Services\Report\ReportExportService.
 */
class ReportExportNotification extends Notification
{
    use ConfigurableNotification;

    public const READY = 'ready';

    public const FAILED = 'failed';

    public function __construct(private readonly ReportExport $export, private readonly string $subtype) {}

    protected function notificationKey(): string
    {
        return "notif_report_export_{$this->subtype}";
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return [
            'type' => 'report_export',
            'subtype' => $this->subtype,
            'report_export_id' => $this->export->id,
            'report_key' => $this->export->report_key,
            'format' => $this->export->format,
            'file_name' => $this->export->file_name,
        ];
    }
}
