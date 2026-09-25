<?php

namespace App\Exports\Report;

use App\Models\Ticket\Ticket;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;

/**
 * Excel workbook of the "Ticket & SLA overview" report: a summary sheet plus every row.
 * Public properties so tests can inspect what went into the file (Excel::assertDownloaded).
 */
class TicketOverviewExport implements WithMultipleSheets
{
    /**
     * @param  array<string, mixed>  $summary  TicketOverviewReportService::summary()
     * @param  Collection<int, Ticket>  $rows
     */
    public function __construct(public array $summary, public Collection $rows) {}

    /**
     * @return list<object>
     */
    public function sheets(): array
    {
        return [new TicketOverviewSummarySheet($this->summary), new TicketOverviewRowsSheet($this->rows)];
    }
}
