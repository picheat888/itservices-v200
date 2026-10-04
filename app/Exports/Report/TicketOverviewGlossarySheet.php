<?php

namespace App\Exports\Report;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnWidths;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Concerns\WithTitle;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * "คำอธิบายคอลัมน์" sheet: what every column of the "ข้อมูลดิบ" and "ประวัติ" sheets means,
 * read straight from those sheets' columns() — so a column added there is explained here too.
 */
class TicketOverviewGlossarySheet implements FromArray, ShouldAutoSize, WithColumnWidths, WithHeadings, WithStyles, WithTitle
{
    public function title(): string
    {
        return 'คำอธิบายคอลัมน์';
    }

    /** @return list<string> */
    public function headings(): array
    {
        return ['ชีต', 'คอลัมน์', 'ความหมาย'];
    }

    /** @return list<list<string>> */
    public function array(): array
    {
        $rows = [];
        foreach ([TicketOverviewRawSheet::TITLE => TicketOverviewRawSheet::columns(), TicketOverviewHistorySheet::TITLE => TicketOverviewHistorySheet::columns()] as $sheet => $columns) {
            foreach ($columns as $column) {
                $rows[] = [$sheet, $column['heading'], $column['meaning']];
            }
        }

        // How the hour figures are counted — the one thing a column name cannot say.
        $rows[] = ['หมายเหตุ', 'ชั่วโมง (ชม.)', 'นับเป็นชั่วโมงตามปฏิทิน (รวมนอกเวลาทำการและวันหยุด) ส่วนกำหนดเวลา SLA คำนวณตามกติกา SLA ที่ตั้งไว้ในหน้า "ตั้งค่า"'];

        return $rows;
    }

    /** @return array<string, int> */
    public function columnWidths(): array
    {
        return ['C' => 90];
    }

    /** @return array<int|string, array<string, mixed>> */
    public function styles(Worksheet $sheet): array
    {
        return [1 => ['font' => ['bold' => true]], 'C' => ['alignment' => ['wrapText' => true, 'vertical' => 'top']]];
    }
}
