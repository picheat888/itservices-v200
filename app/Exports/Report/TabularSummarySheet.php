<?php

namespace App\Exports\Report;

use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\DateDisplay;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithTitle;

/**
 * "สรุป" sheet of any tabular report workbook: the report's title, the dates and filters the
 * file covers, generation time, and its headline numbers.
 */
class TabularSummarySheet implements FromArray, ShouldAutoSize, WithTitle
{
    /**
     * @param  list<ReportSummary>  $summary
     * @param  list<array{0: string, 1: string}>  $scope  TabularReport::scopeLines()
     */
    public function __construct(private TabularReport $report, private array $summary, private array $scope = []) {}

    public function title(): string
    {
        return 'สรุป';
    }

    /**
     * @return list<list<string|int|float|null>>
     */
    public function array(): array
    {
        $rows = [
            [$this->report->title()],
            ...$this->scope,
            ['สร้างเมื่อ', DateDisplay::dateTime(now())],
            [],
            ['ตัวชี้วัด', 'ค่า'],
        ];

        foreach ($this->summary as $item) {
            $rows[] = [$item->heading, $item->value];
        }

        // Note on negative days-left values
        foreach ($this->report->sheetColumns() as $column) {
            if ($column->type === 'days_left') {
                $rows[] = [];
                $rows[] = ['หมายเหตุ', "{$column->heading} ติดลบ คือเลยกำหนดมาแล้ว"];
            }
        }

        return $rows;
    }
}
