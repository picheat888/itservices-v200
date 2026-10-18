<?php

// "คำอธิบายคอลัมน์" sheet of a tabular report workbook: each data column's kind of data,
// allowed values and meaning, so the file can be read without the app (Power BI, outside audit).

namespace App\Exports\Report;

use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\TabularReport;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithColumnWidths;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Concerns\WithTitle;
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class TabularGlossarySheet implements FromArray, WithColumnWidths, WithEvents, WithHeadings, WithStyles, WithTitle
{
    public const TITLE = 'คำอธิบายคอลัมน์';

    public function __construct(private TabularReport $report) {}

    public function title(): string
    {
        return self::TITLE;
    }

    /** @return list<string> */
    public function headings(): array
    {
        return ['ชีต', 'คอลัมน์', 'ชนิดข้อมูล', 'ความหมาย'];
    }

    /** @return list<list<string>> */
    public function array(): array
    {
        $sheet = $this->report->sheetTitle();

        return array_map(
            fn (ReportColumn $c) => [$sheet, $c->heading, $c->typeLabel(), $c->meaning() ?? ''],
            $this->report->sheetColumns(),
        );
    }

    /** @return array<string, int> */
    public function columnWidths(): array
    {
        return ['A' => 14, 'B' => 32, 'C' => 48, 'D' => 80];
    }

    /** @return array<string, array<string, mixed>> */
    public function styles(Worksheet $sheet): array
    {
        return ['C:D' => ['alignment' => ['wrapText' => true, 'vertical' => 'top']]];
    }

    /** @return array<class-string, callable> */
    public function registerEvents(): array
    {
        return [AfterSheet::class => fn (AfterSheet $event) => SheetLayout::table($event->sheet->getDelegate())];
    }
}
