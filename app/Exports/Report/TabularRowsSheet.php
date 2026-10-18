<?php

namespace App\Exports\Report;

use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnFormatting;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStrictNullComparison;
use Maatwebsite\Excel\Concerns\WithTitle;
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;

/**
 * "ข้อมูลดิบ" sheet of any tabular report workbook: one line per row, columns straight from the
 * report's own column definitions so the sheet can never drift from the on-screen table — plus
 * any sheet-only columns, in the report's sheet order (TabularReport::sheetColumns()).
 */
class TabularRowsSheet implements FromCollection, ShouldAutoSize, WithColumnFormatting, WithEvents, WithHeadings, WithMapping, WithStrictNullComparison, WithTitle
{
    /** @param Collection<int, Model> $rows */
    public function __construct(private TabularReport $report, private Collection $rows) {}

    public function title(): string
    {
        return SheetLayout::title($this->report->sheetTitle());
    }

    public function collection(): Collection
    {
        return $this->rows;
    }

    /**
     * Counts, days and hours group thousands and keep the column's decimals; money shows two; dates read as ISO. Cells stay numeric.
     *
     * @return array<string, string>
     */
    public function columnFormats(): array
    {
        $formats = [];
        foreach ($this->report->sheetColumns() as $i => $column) {
            $format = $column->sheetFormat();
            if ($format !== null) {
                $formats[Coordinate::stringFromColumnIndex($i + 1)] = $format;
            }
        }

        return $formats;
    }

    /**
     * @return array<class-string, callable>
     */
    public function registerEvents(): array
    {
        return [AfterSheet::class => fn (AfterSheet $event) => SheetLayout::table($event->sheet->getDelegate())];
    }

    /**
     * @return list<string>
     */
    public function headings(): array
    {
        return array_map(fn (ReportColumn $c) => $c->heading, $this->report->sheetColumns());
    }

    /**
     * @param  Model  $model
     * @return list<string|int|float|null>
     */
    public function map($model): array
    {
        return array_map(fn (ReportColumn $c) => $c->sheetValue($model), $this->report->sheetColumns());
    }
}
