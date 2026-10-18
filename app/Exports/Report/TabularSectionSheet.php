<?php

namespace App\Exports\Report;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStrictNullComparison;
use Maatwebsite\Excel\Concerns\WithTitle;
use Maatwebsite\Excel\Events\AfterSheet;

/**
 * One extra sheet of a tabular report workbook — a table the report adds between its summary
 * and its rows (TabularReport::exportSections), e.g. "ตามประเภทคำขอ" of the SLA by request
 * type report. Headings first, then the rows exactly as the report built them.
 */
class TabularSectionSheet implements FromArray, ShouldAutoSize, WithEvents, WithHeadings, WithStrictNullComparison, WithTitle
{
    /** @var array<string, string> cell → number format of the date cells */
    private array $dateFormats = [];

    /**
     * @param  array{title: string, headings: list<string>, rows: list<list<mixed>>}  $section
     */
    public function __construct(private array $section) {}

    public function title(): string
    {
        return SheetLayout::title($this->section['title']);
    }

    /**
     * @return list<string>
     */
    public function headings(): array
    {
        return $this->section['headings'];
    }

    /**
     * @return list<list<string|int|float|null>>
     */
    public function array(): array
    {
        [$rows, $this->dateFormats] = SheetLayout::withDates($this->section['rows'], 2);

        return $rows;
    }

    /**
     * @return array<class-string, callable>
     */
    public function registerEvents(): array
    {
        return [AfterSheet::class => function (AfterSheet $event): void {
            $sheet = $event->sheet->getDelegate();
            SheetLayout::applyFormats($sheet, $this->dateFormats);
            SheetLayout::table($sheet);
        }];
    }
}
