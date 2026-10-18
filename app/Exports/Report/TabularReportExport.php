<?php

namespace App\Exports\Report;

use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;
use Maatwebsite\Excel\Concerns\WithProperties;

/**
 * Excel workbook of any tabular report: a summary sheet, one sheet per extra section the report
 * gives (TabularReport::exportSections), every row ("ข้อมูลดิบ"), then what each column means.
 * Public properties so tests can inspect what went into the file (Excel::assertDownloaded).
 */
class TabularReportExport implements WithMultipleSheets, WithProperties
{
    /**
     * @param  list<ReportSummary>  $summary
     * @param  Collection<int, Model>  $rows
     * @param  list<array{title: string, headings: list<string>, rows: list<list<mixed>>}>  $sections
     * @param  list<array{0: string, 1: string}>  $scope  TabularReport::scopeLines()
     */
    public function __construct(public TabularReport $report, public array $summary, public Collection $rows, public array $sections = [], public array $scope = [], public string $exportedBy = '') {}

    /**
     * @return list<object>
     */
    public function sheets(): array
    {
        $facts = SheetLayout::fileFacts($this->exportedBy, $this->rows->count(), $this->report->sheetTitle(), $this->omittedColumns());

        return [
            new TabularSummarySheet($this->report, $this->summary, $this->scope, $facts),
            // A section the PDF replaces with an "empty" line has no table to give a sheet.
            ...array_map(fn (array $section) => new TabularSectionSheet($section), array_filter($this->sections, fn (array $section) => empty($section['empty']))),
            new TabularRowsSheet($this->report, $this->rows),
            new TabularGlossarySheet($this->report),
        ];
    }

    /** @return array<string, string> */
    public function properties(): array
    {
        return SheetLayout::properties($this->report->title(), $this->report->key(), $this->exportedBy);
    }

    /**
     * Page columns the reader's column picker left out of this file.
     *
     * @return list<string>
     */
    private function omittedColumns(): array
    {
        $kept = array_map(fn (ReportColumn $c) => $c->key, $this->report->sheetColumns());

        return array_values(array_map(
            fn (ReportColumn $c) => $c->heading,
            array_filter($this->report->screenColumns(), fn (ReportColumn $c) => ! in_array($c->key, $kept, true)),
        ));
    }
}
