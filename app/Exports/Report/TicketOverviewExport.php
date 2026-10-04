<?php

namespace App\Exports\Report;

use App\Models\Ticket\Ticket;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;

/**
 * Excel workbook of the "Ticket & SLA overview" report: the summary, the short ticket list,
 * then the raw data — every field of every ticket, what happened on each, and a sheet saying
 * what each raw column means. Public properties so tests can inspect what went into the file.
 */
class TicketOverviewExport implements WithMultipleSheets
{
    /**
     * @param  array<string, mixed>  $summary  TicketOverviewReportService::summary()
     * @param  Collection<int, Ticket>  $rows  with the relations TicketOverviewExporter loads
     * @param  Collection<int, array<string, mixed>>  $history  TicketHistory::for($rows)
     */
    public function __construct(public array $summary, public Collection $rows, public ?Collection $history = null) {}

    /**
     * @return list<object>
     */
    public function sheets(): array
    {
        return [
            new TicketOverviewSummarySheet($this->summary),
            new TicketOverviewRowsSheet($this->rows),
            new TicketOverviewRawSheet($this->rows),
            new TicketOverviewHistorySheet($this->history ?? collect()),
            new TicketOverviewGlossarySheet,
        ];
    }
}
