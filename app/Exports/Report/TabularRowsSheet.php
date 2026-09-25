<?php

namespace App\Exports\Report;

use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithTitle;

/**
 * "รายการ" sheet of any tabular report workbook: one line per row, columns straight from the
 * report's own column definitions so the sheet can never drift from the on-screen table.
 */
class TabularRowsSheet implements FromCollection, ShouldAutoSize, WithHeadings, WithMapping, WithTitle
{
    /** @param Collection<int, Model> $rows */
    public function __construct(private TabularReport $report, private Collection $rows) {}

    public function title(): string
    {
        return 'รายการ';
    }

    public function collection(): Collection
    {
        return $this->rows;
    }

    /**
     * @return list<string>
     */
    public function headings(): array
    {
        return array_map(fn (ReportColumn $c) => $c->heading, $this->report->columns());
    }

    /**
     * @param  Model  $model
     * @return list<string|int|float|null>
     */
    public function map($model): array
    {
        return array_map(fn (ReportColumn $c) => $c->exportValue($model), $this->report->columns());
    }
}
