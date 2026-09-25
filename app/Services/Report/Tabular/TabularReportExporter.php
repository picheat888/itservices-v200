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
            return Excel::download(new TabularReportExport($report, $summary, (clone $query)->get()), $filename);
        }

        $rows = (clone $query)->limit(self::PDF_ROW_LIMIT)->get();
        $total = collect($summary)->firstWhere('key', 'total')?->value ?? $rows->count();

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
