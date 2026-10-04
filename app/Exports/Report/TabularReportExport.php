<?php

namespace App\Exports\Report;

use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;

/**
 * Excel workbook of any tabular report: a summary sheet, one sheet per extra section the report
 * gives (TabularReport::exportSections), then every row.
 * Public properties so tests can inspect what went into the file (Excel::assertDownloaded).
 */
class TabularReportExport implements WithMultipleSheets
{
    /**
     * @param  list<ReportSummary>  $summary
     * @param  Collection<int, Model>  $rows
     * @param  list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>  $sections
     */
    public function __construct(public TabularReport $report, public array $summary, public Collection $rows, public array $sections = []) {}

    /**
     * @return list<object>
     */
    public function sheets(): array
    {
        return [
            new TabularSummarySheet($this->report, $this->summary),
            ...array_map(fn (array $section) => new TabularSectionSheet($section), $this->sections),
            new TabularRowsSheet($this->report, $this->rows),
        ];
    }
}
