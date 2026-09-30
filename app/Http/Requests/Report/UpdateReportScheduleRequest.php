<?php

namespace App\Http\Requests\Report;

use App\Models\Report\ReportSchedule;
use App\Support\ReportCatalogue;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Editing a scheduled report from the Report Center: format, timing, recipients, or pausing
 * it. The report and its filters stay what the schedule was set with. Only the owner gets
 * here (a row of anyone else's is a 404), and changing it needs access to the report still.
 */
class UpdateReportScheduleRequest extends FormRequest
{
    private ?ReportSchedule $schedule = null;

    public function schedule(): ReportSchedule
    {
        return $this->schedule ??= ReportSchedule::query()
            ->where('user_id', $this->user()->id)
            ->findOrFail((int) $this->route('schedule'));
    }

    public function authorize(): bool
    {
        return ReportCatalogue::allows($this->user(), $this->schedule()->report_key);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $formats = ReportCatalogue::definitions()[$this->schedule()->report_key]['formats'] ?? [];

        return [
            'format' => ['sometimes', Rule::in($formats)],
            'frequency' => ['sometimes', Rule::in(ReportSchedule::FREQUENCIES)],
            'send_hour' => ['sometimes', 'integer', 'between:0,23'],
            'recipients' => ['sometimes', 'array', 'min:1', 'max:'.ReportSchedule::MAX_RECIPIENTS],
            'recipients.*' => ['required', 'string', 'email:rfc', 'max:190', 'distinct:ignore_case'],
            'active' => ['sometimes', 'boolean'],
        ];
    }
}
