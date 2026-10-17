<?php

namespace App\Http\Requests\Report;

use App\Http\Requests\Report\Concerns\SchedulesReport;
use App\Support\ReportCatalogue;

/**
 * "ตั้งเวลาส่ง" on the Ticket & SLA overview page: the screen's filters and a format (as an
 * export) plus the schedule itself. The from/to sent here are replaced on every run.
 */
class ScheduleTicketOverviewRequest extends ExportTicketOverviewRequest
{
    use SchedulesReport;

    public function authorize(): bool
    {
        return ReportCatalogue::canSchedule($this->user(), ReportCatalogue::TICKETS_OVERVIEW);
    }

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
