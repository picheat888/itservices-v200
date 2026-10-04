<?php

namespace App\Exports\Report;

use App\Models\Ticket\Ticket;
use App\Services\Report\TicketLabels;
use App\Services\Report\TicketMetrics;
use App\Support\SystemTime;
use Closure;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnWidths;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStrictNullComparison;
use Maatwebsite\Excel\Concerns\WithStyles;
use Maatwebsite\Excel\Concerns\WithTitle;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * "ข้อมูลดิบ" sheet: everything the system keeps on each ticket, one line per ticket, in words
 * rather than codes ("งานซ่อม (ช่างภายนอก)", not "repair_vendor"). Each column is declared once
 * in columns() — heading, meaning and value together — and TicketOverviewGlossarySheet reads
 * the same list, so the explanation can never drift from the column it explains.
 * Expects the rows loaded by TicketOverviewExporter (relations + updates/attachments counts).
 * Strict null comparison, so a count of 0 prints as 0 rather than an empty cell.
 */
class TicketOverviewRawSheet implements FromCollection, ShouldAutoSize, WithColumnWidths, WithHeadings, WithMapping, WithStrictNullComparison, WithStyles, WithTitle
{
    public const TITLE = 'ข้อมูลดิบ';

    /** @var list<array{heading: string, meaning: string, wrap?: bool, value: Closure(Ticket): (string|int|float|null)}> */
    private array $columns;

    /** @param Collection<int, Ticket> $rows */
    public function __construct(private Collection $rows)
    {
        $this->columns = self::columns();
    }

    /**
     * Every column in sheet order; `wrap` marks free text, which gets a fixed width and wraps.
     *
     * @return list<array{heading: string, meaning: string, wrap?: bool, value: Closure(Ticket): (string|int|float|null)}>
     */
    public static function columns(): array
    {
        $now = now();

        return [
            ['heading' => 'เลขที่ Ticket', 'meaning' => 'เลขอ้างอิงของ Ticket ใช้เทียบกับชีต "ประวัติ"', 'value' => fn (Ticket $t) => $t->ticket_no],
            ['heading' => 'เรื่อง', 'meaning' => 'หัวข้อปัญหาที่ผู้แจ้งตั้ง', 'value' => fn (Ticket $t) => $t->subject],
            ['heading' => 'รายละเอียดปัญหา', 'meaning' => 'ข้อความอธิบายปัญหาที่ผู้แจ้งเขียนตอนเปิด Ticket', 'wrap' => true, 'value' => fn (Ticket $t) => $t->description],
            ['heading' => 'หมวด', 'meaning' => 'ประเภทของปัญหา เช่น ฮาร์ดแวร์ ซอฟต์แวร์ เครือข่าย', 'value' => fn (Ticket $t) => TicketLabels::category($t->category?->value)],
            ['heading' => 'ความสำคัญ', 'meaning' => 'ความเร่งด่วนที่ทีม IT กำหนดตอนรับเคส (ว่าง = ยังไม่ได้กำหนด) ใช้เลือกกำหนดเวลา SLA', 'value' => fn (Ticket $t) => TicketLabels::priority($t->priority?->value)],
            ['heading' => 'ลักษณะงาน', 'meaning' => 'งานปกติ หรืองานซ่อมที่ส่งให้ช่างภายใน/ภายนอก งานซ่อมใช้กำหนดเวลาของงานซ่อมแทน SLA ปกติ', 'value' => fn (Ticket $t) => TicketLabels::workClass($t->work_class?->value)],
            ['heading' => 'สถานะ', 'meaning' => 'สถานะล่าสุด ณ เวลาที่ส่งออกไฟล์: เปิด / กำลังดำเนินการ / เสร็จสิ้น / ยกเลิก', 'value' => fn (Ticket $t) => TicketLabels::status($t->status?->value)],
            ['heading' => 'ที่มา', 'meaning' => 'ผู้ใช้เปิด Ticket เอง หรือระบบเปิดให้อัตโนมัติจากคำขอที่อนุมัติแล้ว', 'value' => fn (Ticket $t) => TicketLabels::source($t->source?->value)],
            ['heading' => 'เลขที่คำขอ', 'meaning' => 'คำขอ (Request) ที่เปิด Ticket นี้ ว่าง = ไม่ได้มาจากคำขอ', 'value' => fn (Ticket $t) => $t->serviceRequest?->reference],
            ['heading' => 'รหัสพนักงานผู้แจ้ง', 'meaning' => 'รหัสพนักงานของผู้แจ้งปัญหา', 'value' => fn (Ticket $t) => $t->requester?->code],
            ['heading' => 'ผู้แจ้ง', 'meaning' => 'ชื่อพนักงานที่แจ้งปัญหา (ชื่อไทยถ้ามี)', 'value' => fn (Ticket $t) => $t->requester?->name_th ?: $t->requester?->name],
            ['heading' => 'แผนกผู้แจ้ง', 'meaning' => 'แผนกปัจจุบันของผู้แจ้ง', 'value' => fn (Ticket $t) => $t->requester?->department?->name_th ?: $t->requester?->department?->name],
            ['heading' => 'เบอร์ติดต่อกลับ', 'meaning' => 'เบอร์ที่ผู้แจ้งให้ไว้สำหรับติดต่อกลับ', 'value' => fn (Ticket $t) => $t->callback_phone],
            ['heading' => 'ทรัพย์สินที่เกี่ยวข้อง', 'meaning' => 'รหัสทรัพย์สิน IT ที่ผูกกับปัญหานี้ (ถ้ามี)', 'value' => fn (Ticket $t) => $t->relatedAsset?->asset_code],
            ['heading' => 'ผู้รับผิดชอบ', 'meaning' => 'เจ้าหน้าที่ IT ที่ถือเคสอยู่ล่าสุด ว่าง = ยังไม่มีคนรับ', 'value' => fn (Ticket $t) => $t->assignee?->name],
            ['heading' => 'เปิดเมื่อ', 'meaning' => 'วันเวลาที่เปิด Ticket', 'value' => fn (Ticket $t) => SystemTime::dateTime($t->created_at)],
            ['heading' => 'รับเคสเมื่อ', 'meaning' => 'วันเวลาที่เจ้าหน้าที่รับเคสครั้งแรก (ตอบรับ)', 'value' => fn (Ticket $t) => SystemTime::dateTime($t->responded_at)],
            ['heading' => 'กำหนดรับเคสตาม SLA', 'meaning' => 'เวลาที่ต้องรับเคสให้ทันตามข้อตกลงระดับบริการ (SLA)', 'value' => fn (Ticket $t) => SystemTime::dateTime($t->sla_response_due_at)],
            ['heading' => 'เวลาที่ใช้รับเคส (ชม.)', 'meaning' => 'ชั่วโมงตามปฏิทินจากเปิด Ticket ถึงรับเคส ทศนิยม 1 ตำแหน่ง', 'value' => fn (Ticket $t) => TicketMetrics::responseHours($t)],
            ['heading' => 'ผลการรับเคสตาม SLA', 'meaning' => 'ทัน SLA = รับเคสก่อนกำหนด, เกิน SLA = รับช้า หรือยังไม่มีคนรับทั้งที่เลยกำหนดแล้ว, ว่าง = ยังไม่ถึงกำหนดหรือไม่มีกำหนด', 'value' => fn (Ticket $t) => TicketLabels::sla(TicketMetrics::responseSlaState($t, $now))],
            ['heading' => 'กำหนดแก้เสร็จตาม SLA', 'meaning' => 'เวลาที่ต้องปิดเคสให้ทันตาม SLA (งานซ่อมใช้กำหนดของงานซ่อม)', 'value' => fn (Ticket $t) => SystemTime::dateTime($t->sla_resolve_due_at)],
            ['heading' => 'ปิดเมื่อ', 'meaning' => 'วันเวลาที่ปิดเคส (เสร็จสิ้นหรือยกเลิก)', 'value' => fn (Ticket $t) => SystemTime::dateTime($t->resolved_at)],
            ['heading' => 'เวลาแก้ไข (ชม.)', 'meaning' => 'ชั่วโมงตามปฏิทินจากเปิด Ticket ถึงปิดเคส ทศนิยม 1 ตำแหน่ง', 'value' => fn (Ticket $t) => TicketMetrics::resolveHours($t)],
            ['heading' => 'ผลการแก้ไขตาม SLA', 'meaning' => 'ทัน SLA = ปิดเสร็จก่อนกำหนด, เกิน SLA = ปิดช้า หรือยังเปิดอยู่ทั้งที่เลยกำหนดแล้ว, ว่าง = ยังไม่ถึงกำหนด ไม่มีกำหนด หรือยกเลิก', 'value' => fn (Ticket $t) => TicketLabels::sla(TicketMetrics::resolveSlaState($t, $now))],
            ['heading' => 'บันทึกตอนรับเคส', 'meaning' => 'ข้อความที่เจ้าหน้าที่เขียนตอนกดรับเคส', 'wrap' => true, 'value' => fn (Ticket $t) => $t->take_note],
            ['heading' => 'ผลการดำเนินงาน', 'meaning' => 'ข้อความที่เจ้าหน้าที่เขียนตอนปิดเคส: วิธีแก้ไข หรือเหตุผลที่ยกเลิก', 'wrap' => true, 'value' => fn (Ticket $t) => $t->resolution],
            ['heading' => 'จำนวนบันทึกความคืบหน้า', 'meaning' => 'จำนวนบันทึกความคืบหน้าและการส่งต่องาน (ดูข้อความได้ที่ชีต "ประวัติ")', 'value' => fn (Ticket $t) => (int) $t->updates_count],
            ['heading' => 'จำนวนไฟล์แนบ', 'meaning' => 'จำนวนรูปหรือไฟล์ที่แนบกับ Ticket', 'value' => fn (Ticket $t) => (int) $t->attachments_count],
            ['heading' => 'แก้ไขล่าสุดเมื่อ', 'meaning' => 'วันเวลาล่าสุดที่ข้อมูล Ticket มีการเปลี่ยนแปลง', 'value' => fn (Ticket $t) => SystemTime::dateTime($t->updated_at)],
        ];
    }

    public function title(): string
    {
        return self::TITLE;
    }

    public function collection(): Collection
    {
        return $this->rows;
    }

    /** @return list<string> */
    public function headings(): array
    {
        return array_column(self::columns(), 'heading');
    }

    /**
     * @param  Ticket  $ticket
     * @return list<string|int|float|null>
     */
    public function map($ticket): array
    {
        return array_map(fn (array $column) => ($column['value'])($ticket), $this->columns);
    }

    /** @return array<string, int> */
    public function columnWidths(): array
    {
        return self::wrapColumns($this->columns, fn () => 50);
    }

    /** @return array<string, array<string, mixed>> */
    public function styles(Worksheet $sheet): array
    {
        return self::wrapColumns($this->columns, fn () => ['alignment' => ['wrapText' => true, 'vertical' => 'top']]);
    }

    /**
     * The `wrap` columns keyed by sheet letter, each with what $value gives — shared with the other sheets.
     *
     * @template T
     *
     * @param  list<array{wrap?: bool}>  $columns
     * @param  Closure(): T  $value
     * @return array<string, T>
     */
    public static function wrapColumns(array $columns, Closure $value): array
    {
        $out = [];
        foreach ($columns as $i => $column) {
            if ($column['wrap'] ?? false) {
                $out[Coordinate::stringFromColumnIndex($i + 1)] = $value();
            }
        }

        return $out;
    }
}
