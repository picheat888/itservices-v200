<?php

namespace App\Exports\Report;

use App\Models\Ticket\Ticket;
use App\Services\Report\Tabular\CellDate;
use App\Services\Report\TicketLabels;
use App\Services\Report\TicketMetrics;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnFormatting;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStrictNullComparison;
use Maatwebsite\Excel\Concerns\WithTitle;
use Maatwebsite\Excel\Events\AfterSheet;

/**
 * "รายการ Ticket" sheet: one line per ticket in the report population.
 */
class TicketOverviewRowsSheet implements FromCollection, ShouldAutoSize, WithColumnFormatting, WithEvents, WithHeadings, WithMapping, WithStrictNullComparison, WithTitle
{
    private const SLA_LABELS = ['met' => 'ตรง SLA', 'over_sla' => 'เกิน SLA'];

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
        return ['เลขที่', 'เรื่อง', 'ผู้แจ้ง', 'แผนก', 'หมวด', 'ความสำคัญ', 'สถานะ', 'ที่มา', 'ผู้รับผิดชอบ', 'เปิดเมื่อ', 'ปิดเมื่อ', 'เวลาแก้ไข (ชม.)', 'SLA'];
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
            // The file is Thai throughout, so the requester's Thai name leads when the record has one.
            $ticket->requester?->name_th ?: $ticket->requester?->name,
            $department?->name_th ?: $department?->name,
            TicketLabels::category($ticket->category?->value),
            TicketLabels::priority($ticket->priority?->value),
            TicketLabels::status($ticket->status?->value),
            TicketLabels::source($ticket->source?->value),
            $ticket->assignee?->name,
            CellDate::dateTime($ticket->created_at)?->excelValue(),
            CellDate::dateTime($ticket->resolved_at)?->excelValue(),
            TicketMetrics::resolveHours($ticket),
            self::SLA_LABELS[TicketMetrics::slaState($ticket, now())] ?? '',
        ];
    }

    /** @return array<string, string> */
    public function columnFormats(): array
    {
        return ['J' => CellDate::DATETIME_FORMAT, 'K' => CellDate::DATETIME_FORMAT, 'L' => '#,##0.0'];
    }

    /** @return array<class-string, callable> */
    public function registerEvents(): array
    {
        return [AfterSheet::class => fn (AfterSheet $event) => SheetLayout::table($event->sheet->getDelegate())];
    }
}
