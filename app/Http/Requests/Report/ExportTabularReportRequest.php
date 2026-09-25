<?php

namespace App\Http\Requests\Report;

use Illuminate\Validation\Rule;

/**
 * Export of any tabular report: the screen's filters plus a file format.
 */
class ExportTabularReportRequest extends TabularReportRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [...parent::rules(), 'format' => ['required', Rule::in(['xlsx', 'pdf'])]];
    }
}
