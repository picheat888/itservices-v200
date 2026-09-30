<?php

namespace App\Services\Report\Tabular;

use App\Exports\Report\TabularReportExport;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Support\DocumentName;
use Barryvdh\DomPDF\Facade\Pdf;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\Response;

/**
 * Builds the downloadable file for any tabular report — Excel (summary + every row) or PDF
 * (summary + up to PDF_ROW_LIMIT rows). Synchronous, like the Phase-1 ticket export.
 */
class TabularReportExporter
{
    public const PDF_ROW_LIMIT = 1000;

    /**
     * @param  array<string, mixed>  $filters
     */
    public function download(TabularReport $report, User $viewer, array $filters, string $format): Response
    {
        $query = $report->query($viewer, $filters);
        $summary = $report->summary($query, $filters);
        $filename = DocumentName::make('Report', [str_replace('.', '-', $report->key())], $format);

        if ($format === 'xlsx') {
            $rows = (clone $query)->get();
            $report->hydrateRows($rows, $viewer, $filters);

            return Excel::download(new TabularReportExport($report, $summary, $rows), $filename);
        }

        $rows = (clone $query)->limit(self::PDF_ROW_LIMIT)->get();
        $report->hydrateRows($rows, $viewer, $filters);
        // Counted off the query, not the `total` tile: a grouped report's rows (one per request
        // type, per approver) are not what its headline total counts.
        $total = (clone $query)->toBase()->getCountForPagination();

        return Pdf::loadView('pdf.reports.tabular', [
            'report' => $report,
            'summary' => $summary,
            'rows' => $rows,
            'truncated' => $total > $rows->count(),
            'total' => $total,
            'company' => AppSetting::get('company_name', ''),
            'printedBy' => $viewer->name,
            'printedAt' => now()->format('Y-m-d H:i'),
        ])->setPaper('a4', $report->pdfOrientation())->download($filename);
    }
}
