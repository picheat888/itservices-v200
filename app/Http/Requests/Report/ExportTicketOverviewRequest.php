<?php

namespace App\Http\Requests\Report;

use Illuminate\Validation\Rule;

/**
 * Export of the "Ticket & SLA overview" report: the screen's filters plus a file format.
 */
class ExportTicketOverviewRequest extends TicketOverviewReportRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [...parent::rules(), 'format' => ['required', Rule::in(['xlsx', 'pdf'])]];
    }
}
