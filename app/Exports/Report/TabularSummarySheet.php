<?php

namespace App\Exports\Report;

use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithStrictNullComparison;
use Maatwebsite\Excel\Concerns\WithTitle;
use Maatwebsite\Excel\Events\AfterSheet;

/**
 * "สรุป" sheet of any tabular report workbook: the report's title, the dates and filters the
 * file covers, who made it from which system, how many data rows it holds, and its headline numbers.
 */
class TabularSummarySheet implements FromArray, ShouldAutoSize, WithEvents, WithStrictNullComparison, WithTitle
{
    /** @var array<int, string> sheet row → number format of a headline value */
    private array $valueFormats = [];

    /**
     * @param  list<ReportSummary>  $summary
     * @param  list<array{0: string, 1: string}>  $scope  TabularReport::scopeLines()
     * @param  list<list<string|int>>  $fileFacts  SheetLayout::fileFacts()
     */
    public function __construct(private TabularReport $report, private array $summary, private array $scope = [], private array $fileFacts = []) {}

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
            $sheet = $event->sheet->getDelegate();
            foreach ($this->valueFormats as $row => $format) {
                $sheet->getStyle("B{$row}")->getNumberFormat()->setFormatCode($format);
            }
            $sheet->getStyle('A1')->getFont()->setBold(true);
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
            ...$this->fileFacts,
            [],
            ['ตัวชี้วัด', 'ค่า'],
        ];

        // The writer leaves out empty rows, so a sheet row counts only the filled ones
        $sheetRow = count(array_filter($rows, fn (array $cells) => $cells !== []));
        foreach ($this->summary as $item) {
            $rows[] = [$item->heading, $item->value];
            $sheetRow++;
            $format = match ($item->format) {
                'count' => '#,##0',
                'money' => '#,##0.00',
                'hours', 'years', 'days' => '#,##0.0',
                default => null,
            };
            if ($format !== null && $item->value !== null) {
                $this->valueFormats[$sheetRow] = $format;
            }
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
