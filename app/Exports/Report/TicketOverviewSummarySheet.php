<?php

namespace App\Exports\Report;

use App\Enums\Ticket\TicketCategory;
use App\Services\Report\TicketLabels;
use App\Support\DateDisplay;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithTitle;
use Maatwebsite\Excel\Events\AfterSheet;

/**
 * "สรุป" sheet of the ticket report workbook: headline numbers and the breakdowns, down to
 * every department by category and every IT staff member, as the page shows them.
 */
class TicketOverviewSummarySheet implements FromArray, ShouldAutoSize, WithEvents, WithTitle
{
    /** @param array<string, mixed> $summary */
    public function __construct(private array $summary) {}

    public function title(): string
    {
        return 'สรุป';
    }

    /**
     * Whole-number cells (counts) group thousands; averages and rates keep their own look. Cells stay numeric.
     *
     * @return array<class-string, callable>
     */
    public function registerEvents(): array
    {
        return [AfterSheet::class => function (AfterSheet $event): void {
            $row = 0;
            foreach ($this->array() as $cells) {
                // The writer leaves out empty rows, so they take no line in the sheet.
                if ($cells === []) {
                    continue;
                }
                $row++;
                foreach (array_values($cells) as $c => $value) {
                    if (is_int($value)) {
                        $event->sheet->getDelegate()->getStyle([$c + 1, $row])->getNumberFormat()->setFormatCode('#,##0');
                    }
                }
            }
        }];
    }

    /**
     * @return list<list<string|int|float|null>>
     */
    public function array(): array
    {
        $s = $this->summary;
        $k = $s['kpi'];

        $rows = [
            ['รายงานภาพรวม Ticket & SLA'],
            ['ช่วงวันที่', DateDisplay::range($s['range']['from'], $s['range']['to'])],
            ['สร้างเมื่อ', DateDisplay::dateTime($s['generated_at'])],
            [],
            ['ตัวชี้วัด', 'ค่า'],
            ['Ticket ทั้งหมด', $k['total']],
            ['ปิดสำเร็จ', $k['completed']],
            ['ยกเลิก', $k['canceled']],
            ['ปิดตาม SLA (%)', $k['sla_rate']],
            ['วัด SLA ได้ / ตรง SLA', $k['sla_measured'].' / '.$k['sla_met']],
            ['เวลาแก้ไขโดยเฉลี่ย (ชม.)', $k['avg_resolve_hours']],
            ['90% ปิดได้ไม่เกิน (ชม.)', $k['p90_resolve_hours']],
            ['ค้างอยู่ตอนนี้', $s['backlog']['open'] + $s['backlog']['in_progress']],
            ['ค้างเกิน SLA', $s['backlog']['over_sla']],
            [],
            ['SLA ตามความสำคัญ', 'วัดได้', 'ตรง SLA', '%'],
        ];
        foreach ($s['sla_by_priority'] as $p) {
            $rows[] = [TicketLabels::priority($p['priority']), $p['measured'], $p['met'], $p['rate']];
        }
        $rows[] = [];
        $rows[] = ['หมวด', 'จำนวน'];
        foreach ($s['by_category'] as $c) {
            $rows[] = [TicketLabels::category($c['category']), $c['count']];
        }
        $categories = TicketCategory::cases();
        $rows[] = [];
        $rows[] = ['แผนก', 'Ticket', ...array_map(fn (TicketCategory $c) => TicketLabels::category($c->value), $categories), 'ยังไม่ปิด', 'ทัน SLA %'];
        foreach ($s['by_department'] as $d) {
            $rows[] = [
                $d['name_th'] ?: ($d['name'] ?? 'ไม่ระบุแผนก'),
                $d['count'],
                ...array_map(fn (TicketCategory $c) => $d['categories'][$c->value] ?? 0, $categories),
                $d['open'],
                $d['sla_rate'],
            ];
        }
        $rows[] = [];
        $rows[] = ['ผลงานเจ้าหน้าที่ IT (นับเคสที่ปิดในช่วงวันที่)'];
        $rows[] = ['ผู้รับผิดชอบ', 'ทั้งหมด', 'ปิดสำเร็จ', 'ยกเลิก', 'เวลาแก้ไขโดยเฉลี่ย (ชม.)', 'ทัน SLA %'];
        foreach ($s['by_assignee'] as $a) {
            $rows[] = [$a['name'], $a['total'], $a['completed'], $a['canceled'], $a['avg_resolve_hours'], $a['sla_rate']];
        }

        return $rows;
    }
}
