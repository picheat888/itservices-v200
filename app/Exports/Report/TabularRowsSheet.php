<?php

namespace App\Exports\Report;

use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnFormatting;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithTitle;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;

/**
 * "รายการ" sheet of any tabular report workbook: one line per row, columns straight from the
 * report's own column definitions so the sheet can never drift from the on-screen table — plus
 * any sheet-only columns, in the report's sheet order (TabularReport::sheetColumns()).
 */
class TabularRowsSheet implements FromCollection, ShouldAutoSize, WithColumnFormatting, WithHeadings, WithMapping, WithTitle
{
    /** @param Collection<int, Model> $rows */
    public function __construct(private TabularReport $report, private Collection $rows) {}

    public function title(): string
    {
        return $this->report->sheetTitle();
    }

    public function collection(): Collection
    {
        return $this->rows;
    }

    /**
     * Counts, days and hours group thousands; money shows two decimals. Cells stay numeric.
     *
     * @return array<string, string>
     */
    public function columnFormats(): array
    {
        $formats = [];
        foreach ($this->report->sheetColumns() as $i => $column) {
            $format = match ($column->type) {
                'money' => '#,##0.00',
                'number', 'days_left', 'hours_left' => '#,##0',
                default => null,
            };
            if ($format !== null) {
                $formats[Coordinate::stringFromColumnIndex($i + 1)] = $format;
            }
        }

        return $formats;
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
        return array_map(fn (ReportColumn $c) => $c->exportValue($model), $this->report->sheetColumns());
    }
}
