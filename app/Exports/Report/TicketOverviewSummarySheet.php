<?php

namespace App\Exports\Report;

use App\Services\Report\TicketLabels;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithTitle;

/**
 * "สรุป" sheet of the ticket report workbook: headline numbers and the breakdowns.
 */
class TicketOverviewSummarySheet implements FromArray, ShouldAutoSize, WithTitle
{
    /** @param array<string, mixed> $summary */
    public function __construct(private array $summary) {}

    public function title(): string
    {
        return 'สรุป';
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
            ['ช่วงวันที่', $s['range']['from'].' – '.$s['range']['to']],
            ['สร้างเมื่อ', $s['generated_at']],
            [],
            ['ตัวชี้วัด', 'ค่า'],
            ['Ticket ทั้งหมด', $k['total']],
            ['ปิดสำเร็จ', $k['completed']],
            ['ยกเลิก', $k['canceled']],
            ['ปิดตาม SLA (%)', $k['sla_rate']],
            ['วัด SLA ได้ / ตรง SLA', $k['sla_measured'].' / '.$k['sla_met']],
            ['เวลาแก้ไขมัธยฐาน (ชม.)', $k['median_resolve_hours']],
            ['เวลาแก้ไข P90 (ชม.)', $k['p90_resolve_hours']],
            ['ค้างอยู่ตอนนี้', $s['backlog']['open'] + $s['backlog']['in_progress']],
            ['ค้างเกิน SLA', $s['backlog']['breached']],
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
        $rows[] = [];
        $rows[] = ['แผนก', 'จำนวน', 'SLA %'];
        foreach ($s['by_department'] as $d) {
            $rows[] = [$d['name_th'] ?: ($d['name'] ?? 'ไม่ระบุแผนก'), $d['count'], $d['sla_rate']];
        }

        return $rows;
    }
}
