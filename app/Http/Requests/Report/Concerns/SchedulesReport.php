<?php

namespace App\Http\Requests\Report\Concerns;

use App\Models\Report\ReportSchedule;
use Illuminate\Validation\Rule;

/**
 * The schedule half of a "ตั้งเวลาส่ง" request (Report Center Phase 6), shared by the
 * tabular and the ticket overview schedule requests: how often, at what hour, and to which
 * addresses — any addresses (user decision), capped at ReportSchedule::MAX_RECIPIENTS.
 */
trait SchedulesReport
{
    /** @return array<string, mixed> */
    protected function scheduleRules(): array
    {
        return [
            'frequency' => ['required', Rule::in(ReportSchedule::FREQUENCIES)],
            'send_hour' => ['required', 'integer', 'between:0,23'],
            'recipients' => ['required', 'array', 'min:1', 'max:'.ReportSchedule::MAX_RECIPIENTS],
            'recipients.*' => ['required', 'string', 'email:rfc', 'max:190', 'distinct:ignore_case'],
        ];
    }

    /** @return list<string> */
    protected function scheduleKeys(): array
    {
        return ['frequency', 'send_hour', 'recipients'];
    }
}
