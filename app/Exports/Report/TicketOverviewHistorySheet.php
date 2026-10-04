<?php

namespace App\Exports\Report;

use App\Support\SystemTime;
use Carbon\CarbonInterface;
use Closure;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnWidths;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Concerns\WithTitle;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * "ประวัติ" sheet: one line per thing that happened on a ticket (opened, taken, noted, handed
 * over, closed …), grouped by ticket in the workbook's order and oldest first within each —
 * built by App\Services\Report\TicketHistory. Columns are declared once in columns(), which
 * TicketOverviewGlossarySheet also reads.
 */
class TicketOverviewHistorySheet implements FromCollection, ShouldAutoSize, WithColumnWidths, WithHeadings, WithMapping, WithStyles, WithTitle
{
    public const TITLE = 'ประวัติ';

    /** @param Collection<int, array{ticket_no: string, at: ?CarbonInterface, event: string, actor: ?string, detail: ?string}> $events */
    public function __construct(private Collection $events) {}

    /**
     * @return list<array{heading: string, meaning: string, wrap?: bool, value: Closure(array<string, mixed>): ?string}>
     */
    public static function columns(): array
    {
        return [
            ['heading' => 'เลขที่ Ticket', 'meaning' => 'Ticket ที่เหตุการณ์นี้เกิดขึ้น ตรงกับคอลัมน์เดียวกันในชีต "ข้อมูลดิบ"', 'value' => fn (array $e) => $e['ticket_no']],
            ['heading' => 'วันเวลา', 'meaning' => 'เวลาที่เกิดเหตุการณ์', 'value' => fn (array $e) => SystemTime::dateTime($e['at'])],
            ['heading' => 'เหตุการณ์', 'meaning' => 'สิ่งที่เกิดขึ้น: เปิด Ticket, รับเคส, มอบหมายงาน, บันทึกความคืบหน้า, ส่งต่องาน, เปลี่ยนลักษณะงาน, แก้ไขข้อมูล, แนบ/ลบไฟล์, ปิดเคส, ยกเลิกเคส', 'value' => fn (array $e) => $e['event']],
            ['heading' => 'ผู้ทำรายการ', 'meaning' => 'ผู้ที่ทำเหตุการณ์นี้ ("ระบบ" = ระบบทำให้อัตโนมัติ)', 'value' => fn (array $e) => $e['actor']],
            ['heading' => 'รายละเอียด', 'meaning' => 'ข้อความของบันทึก ผู้รับงานใหม่ สถานะที่ปิด หรือชื่อไฟล์ แล้วแต่เหตุการณ์', 'wrap' => true, 'value' => fn (array $e) => $e['detail']],
        ];
    }

    public function title(): string
    {
        return self::TITLE;
    }

    public function collection(): Collection
    {
        return $this->events;
    }

    /** @return list<string> */
    public function headings(): array
    {
        return array_column(self::columns(), 'heading');
    }

    /**
     * @param  array<string, mixed>  $event
     * @return list<?string>
     */
    public function map($event): array
    {
        return array_map(fn (array $column) => ($column['value'])($event), self::columns());
    }

    /** @return array<string, int> */
    public function columnWidths(): array
    {
        return TicketOverviewRawSheet::wrapColumns(self::columns(), fn () => 70);
    }

    /** @return array<string, array<string, mixed>> */
    public function styles(Worksheet $sheet): array
    {
        return TicketOverviewRawSheet::wrapColumns(self::columns(), fn () => ['alignment' => ['wrapText' => true, 'vertical' => 'top']]);
    }
}
