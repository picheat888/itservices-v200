<?php

namespace App\Exports\Report;

use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\DateDisplay;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithTitle;
use Maatwebsite\Excel\Events\AfterSheet;

/**
 * "สรุป" sheet of any tabular report workbook: the report's title, the dates and filters the
 * file covers, generation time, and its headline numbers.
 */
class TabularSummarySheet implements FromArray, ShouldAutoSize, WithEvents, WithTitle
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
     * Headline values get a number format by kind (counts group thousands, money two decimals); cells stay numeric.
     *
     * @return array<class-string, callable>
     */
    public function registerEvents(): array
    {
        return [AfterSheet::class => function (AfterSheet $event): void {
            // Title, scope lines, created-at and column heads come first (the blank row takes no line); the tiles follow.
            $row = count($this->scope) + 3;
            foreach ($this->summary as $item) {
                $row++;
                $format = match ($item->format) {
                    'count' => '#,##0',
                    'money' => '#,##0.00',
                    'hours', 'years', 'days' => '#,##0.0',
                    default => null,
                };
                if ($format !== null && $item->value !== null) {
                    $event->sheet->getDelegate()->getStyle("B{$row}")->getNumberFormat()->setFormatCode($format);
                }
            }
        }];
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
