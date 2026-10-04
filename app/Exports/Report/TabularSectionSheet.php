<?php

namespace App\Exports\Report;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithTitle;

/**
 * One extra sheet of a tabular report workbook — a table the report adds between its summary
 * and its rows (TabularReport::exportSections), e.g. "ตามประเภทคำขอ" of the SLA by request
 * type report. Headings first, then the rows exactly as the report built them.
 */
class TabularSectionSheet implements FromArray, ShouldAutoSize, WithHeadings, WithTitle
{
    /**
     * @param  array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}  $section
     */
    public function __construct(private array $section) {}

    public function title(): string
    {
        // Excel caps a sheet name at 31 characters.
        return mb_substr($this->section['title'], 0, 31);
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
        return $this->section['rows'];
    }
}
