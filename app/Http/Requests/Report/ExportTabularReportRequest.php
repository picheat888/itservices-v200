<?php

namespace App\Http\Requests\Report;

use App\Support\ReportCatalogue;
use Illuminate\Validation\Rule;

/**
 * Export of any tabular report: the screen's filters plus a file format. The allowed
 * formats come from the report's own catalogue entry — not every report offers both.
 */
class ExportTabularReportRequest extends TabularReportRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $formats = ReportCatalogue::definitions()[$this->report()->key()]['formats'];

        return [...parent::rules(), 'format' => ['required', Rule::in($formats)]];
    }
}
