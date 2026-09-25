<?php

namespace App\Http\Requests\Report;

use App\Services\Report\Tabular\TabularReport;
use App\Support\ReportCatalogue;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Any tabular report's definition/rows request: the {key} route segment picks the report,
 * ReportCatalogue decides access, and the report's own filters supply the rules.
 */
class TabularReportRequest extends FormRequest
{
    private ?TabularReport $report = null;

    public function report(): TabularReport
    {
        return $this->report ??= ReportCatalogue::tabular((string) $this->route('key'))
            ?? abort(404);
    }

    public function authorize(): bool
    {
        $this->report();

        return ReportCatalogue::allows($this->user(), (string) $this->route('key'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            ...$this->report()->rules(),
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function filters(): array
    {
        return $this->report()->resolveFilters($this->validated());
    }
}
