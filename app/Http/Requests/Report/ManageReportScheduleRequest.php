<?php

// An admin action on anyone's scheduled report: needs reports.schedule_manage, not ownership.

namespace App\Http\Requests\Report;

use App\Models\Report\ReportSchedule;
use App\Support\ReportCatalogue;
use Illuminate\Foundation\Http\FormRequest;

class ManageReportScheduleRequest extends FormRequest
{
    private ?ReportSchedule $schedule = null;

    public function schedule(): ReportSchedule
    {
        return $this->schedule ??= ReportSchedule::query()->with('user:id,name')->findOrFail((int) $this->route('schedule'));
    }

    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission(ReportCatalogue::SCHEDULE_MANAGE);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return match ($this->route()?->getName()) {
            'api.reports.schedules.manage.update' => ['active' => ['required', 'boolean']],
            'api.reports.schedules.manage.recipients.destroy' => ['email' => ['required', 'string', 'max:190']],
            default => [],
        };
    }
}
