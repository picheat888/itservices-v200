<?php

namespace App\Http\Requests\Report;

use App\Support\ReportCatalogue;
use Illuminate\Validation\Rule;

/**
 * Export of the "Ticket & SLA overview" report: the screen's filters plus a file format.
 */
class ExportTicketOverviewRequest extends TicketOverviewReportRequest
{
    public function authorize(): bool
    {
        return ReportCatalogue::canExport($this->user(), ReportCatalogue::TICKETS_OVERVIEW);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [...parent::rules(), 'format' => ['required', Rule::in(['xlsx', 'pdf'])]];
    }
}
