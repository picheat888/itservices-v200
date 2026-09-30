<?php

namespace App\Http\Requests\Report;

use App\Http\Requests\Report\Concerns\SchedulesReport;

/**
 * "ตั้งเวลาส่ง" on a tabular report page: everything an export takes (the screen's filters,
 * a format the report offers, the column picker) plus the schedule itself.
 */
class ScheduleTabularReportRequest extends ExportTabularReportRequest
{
    use SchedulesReport;

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [...parent::rules(), ...$this->scheduleRules()];
    }

    /** @return array<string, mixed> */
    public function filterInput(): array
    {
        return collect(parent::filterInput())->except($this->scheduleKeys())->all();
    }
}
