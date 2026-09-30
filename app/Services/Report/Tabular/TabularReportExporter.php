<?php

namespace App\Services\Report\Tabular;

use App\Exports\Report\TabularReportExport;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Support\DocumentName;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\Storage;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\Response;

/**
 * Builds the file for any tabular report — Excel (summary + every row) or PDF (summary + up
 * to PDF_ROW_LIMIT rows). `download()` answers the request directly; `store()` writes the
 * same file to the private disk for a queued export (GenerateReportExport). Both build it
 * through one path, so the two can never differ.
 */
class TabularReportExporter
{
    public const PDF_ROW_LIMIT = 1000;

    /**
     * @param  array<string, mixed>  $filters
     */
    public function download(TabularReport $report, User $viewer, array $filters, string $format): Response
    {
        $file = $this->build($report, $viewer, $filters, $format);

        return $format === 'xlsx'
            ? Excel::download($file['export'], $file['name'])
            : $file['pdf']->download($file['name']);
    }

    /**
     * Write the file under $directory on the local disk.
     *
     * @param  array<string, mixed>  $filters
     * @return array{name: string, path: string, rows: int}
     */
    public function store(TabularReport $report, User $viewer, array $filters, string $format, string $directory): array
    {
        $file = $this->build($report, $viewer, $filters, $format);
        $path = "{$directory}/{$file['name']}";

        $format === 'xlsx'
            ? Excel::store($file['export'], $path, 'local')
            : Storage::disk('local')->put($path, $file['pdf']->output());

        return ['name' => $file['name'], 'path' => $path, 'rows' => $file['rows']];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{name: string, rows: int, export?: TabularReportExport, pdf?: \Barryvdh\DomPDF\PDF}
     */
    private function build(TabularReport $report, User $viewer, array $filters, string $format): array
    {
        $query = $report->query($viewer, $filters);
        $summary = $report->summary($query, $filters);
        $name = DocumentName::make('Report', [str_replace('.', '-', $report->key())], $format);

        if ($format === 'xlsx') {
            $rows = (clone $query)->get();
            $report->hydrateRows($rows, $viewer, $filters);

            return ['name' => $name, 'rows' => $rows->count(), 'export' => new TabularReportExport($report, $summary, $rows)];
        }

        $rows = (clone $query)->limit(self::PDF_ROW_LIMIT)->get();
        $report->hydrateRows($rows, $viewer, $filters);
        // Counted off the query, not the `total` tile: a grouped report's rows (one per request
        // type, per approver) are not what its headline total counts.
        $total = (clone $query)->toBase()->getCountForPagination();

        $pdf = Pdf::loadView('pdf.reports.tabular', [
            'report' => $report,
            'summary' => $summary,
            'rows' => $rows,
            'truncated' => $total > $rows->count(),
            'total' => $total,
            'company' => AppSetting::get('company_name', ''),
            'printedBy' => $viewer->name,
            'printedAt' => now()->format('Y-m-d H:i'),
        ])->setPaper('a4', $report->pdfOrientation());

        return ['name' => $name, 'rows' => $rows->count(), 'pdf' => $pdf];
    }
}
