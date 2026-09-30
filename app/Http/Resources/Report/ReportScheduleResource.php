<?php

namespace App\Http\Resources\Report;

use App\Models\Report\ReportSchedule;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One scheduled report on the Report Center's "รายงานที่ตั้งเวลาไว้" panel. The stored
 * filters are sent back so the panel can say which screen the schedule was set from.
 *
 * @mixin ReportSchedule
 */
class ReportScheduleResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'report_key' => $this->report_key,
            'format' => $this->format,
            'filters' => (object) ($this->filters ?? []),
            'columns' => $this->columns,
            'frequency' => $this->frequency,
            'send_hour' => $this->send_hour,
            'recipients' => $this->recipients,
            'active' => $this->active,
            'next_run_at' => $this->next_run_at?->toIso8601String(),
            'last_run_at' => $this->last_run_at?->toIso8601String(),
            'last_status' => $this->last_status,
            'last_error' => $this->last_error,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
