<?php

namespace App\Exports\Report;

use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithTitle;

/**
 * "สรุป" sheet of any tabular report workbook: the report's title, generation time, and its
 * headline numbers.
 */
class TabularSummarySheet implements FromArray, ShouldAutoSize, WithTitle
{
    /** @param list<ReportSummary> $summary */
    public function __construct(private TabularReport $report, private array $summary) {}

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
            ['สร้างเมื่อ', now()->format('Y-m-d H:i')],
            [],
            ['ตัวชี้วัด', 'ค่า'],
        ];

        foreach ($this->summary as $item) {
            $rows[] = [$item->heading, $item->value];
        }

        return $rows;
    }
}
