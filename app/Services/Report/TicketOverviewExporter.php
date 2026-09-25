<?php

namespace App\Services\Report;

use App\Exports\Report\TicketOverviewExport;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Support\DocumentName;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\CarbonImmutable;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\Response;

/**
 * Builds the downloadable file for the "Ticket & SLA overview" report.
 * Synchronous in Phase 1 — report populations are in the hundreds of rows.
 */
class TicketOverviewExporter
{
    /** A PDF past this many rows stops being readable; the workbook carries everything. */
    public const PDF_ROW_LIMIT = 1000;

    public function __construct(private TicketOverviewReportService $reports) {}

    /**
     * @param  array{from: CarbonImmutable, to: CarbonImmutable, categories: list<string>, priority: ?string, department_id: ?int, assignee_id: ?int}  $filters
     */
    public function download(User $viewer, array $filters, string $format): Response
    {
        $summary = $this->reports->summary($viewer, $filters);
        $filename = DocumentName::make('TicketReport', [$summary['range']['from'], $summary['range']['to']], $format);

        if ($format === 'xlsx') {
            return Excel::download(new TicketOverviewExport($summary, $this->reports->exportRows($viewer, $filters)), $filename);
        }

        $rows = $this->reports->exportRows($viewer, $filters, self::PDF_ROW_LIMIT);

        return Pdf::loadView('pdf.reports.ticket-overview', [
            'summary' => $summary,
            'rows' => $rows,
            'truncated' => $summary['kpi']['total'] > $rows->count(),
            'company' => AppSetting::get('company_name', ''),
            'printedBy' => $viewer->name,
        ])->setPaper('a4', 'landscape')->download($filename);
    }
}
