<?php

namespace App\Http\Requests\Report;

use App\Services\Report\Tabular\ReportColumn;
use App\Support\ReportCatalogue;
use Illuminate\Validation\Rule;

/**
 * Export of any tabular report: the screen's filters plus a file format. The allowed
 * formats come from the report's own catalogue entry — not every report offers both.
 * `columns` (optional) is the page's column picker: the keys to keep, each one a column
 * of this report; left out, the file carries every column.
 */
class ExportTabularReportRequest extends TabularReportRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $formats = ReportCatalogue::definitions()[$this->report()->key()]['formats'];
        $columnKeys = array_map(fn (ReportColumn $c) => $c->key, $this->report()->columns());

        return [
            ...parent::rules(),
            'format' => ['required', Rule::in($formats)],
            'columns' => ['nullable', 'array', 'min:1'],
            'columns.*' => ['string', 'distinct', Rule::in($columnKeys)],
        ];
    }

    /** @return list<string>|null */
    public function shownColumns(): ?array
    {
        $columns = $this->validated('columns');

        return is_array($columns) ? array_values($columns) : null;
    }
}
