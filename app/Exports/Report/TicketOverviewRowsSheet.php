<?php

namespace App\Exports\Report;

use App\Models\Ticket\Ticket;
use App\Services\Report\TicketMetrics;
use App\Support\SystemTime;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithTitle;

/**
 * "รายการ Ticket" sheet: one line per ticket in the report population.
 */
class TicketOverviewRowsSheet implements FromCollection, ShouldAutoSize, WithHeadings, WithMapping, WithTitle
{
    private const SLA_LABELS = ['met' => 'ตรง SLA', 'breached' => 'เกิน SLA'];

    /** @param Collection<int, Ticket> $rows */
    public function __construct(private Collection $rows) {}

    public function title(): string
    {
        return 'รายการ Ticket';
    }

    public function collection(): Collection
    {
        return $this->rows;
    }

    /**
     * @return list<string>
     */
    public function headings(): array
    {
        return ['เลขที่', 'เรื่อง', 'ผู้แจ้ง', 'แผนก', 'หมวด', 'ความสำคัญ', 'สถานะ', 'ผู้รับผิดชอบ', 'เปิดเมื่อ', 'ปิดเมื่อ', 'เวลาแก้ไข (ชม.)', 'SLA'];
    }

    /**
     * @param  Ticket  $ticket
     * @return list<string|float|null>
     */
    public function map($ticket): array
    {
        $department = $ticket->requester?->department;

        return [
            $ticket->ticket_no,
            $ticket->subject,
            $ticket->requester?->name,
            $department?->name_th ?: $department?->name,
            $ticket->category?->value,
            $ticket->priority?->value,
            $ticket->status?->value,
            $ticket->assignee?->name,
            SystemTime::dateTime($ticket->created_at),
            SystemTime::dateTime($ticket->resolved_at),
            TicketMetrics::resolveHours($ticket),
            self::SLA_LABELS[TicketMetrics::slaState($ticket, now())] ?? '',
        ];
    }
}
