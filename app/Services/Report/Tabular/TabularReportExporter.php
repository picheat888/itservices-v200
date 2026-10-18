<?php

namespace App\Services\Report\Tabular;

use App\Exports\Report\TabularReportExport;
use App\Models\User;
use App\Support\CompanyProfile;
use App\Support\DateDisplay;
use App\Support\DocumentName;
use App\Support\PdfFooter;
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
    public function download(TabularReport $report, User $viewer, array $filters, string $format, ?string $documentNo = null): Response
    {
        $file = $this->build($report, $viewer, $filters, $format, $documentNo);

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
    public function store(TabularReport $report, User $viewer, array $filters, string $format, string $directory, ?string $documentNo = null): array
    {
        $file = $this->build($report, $viewer, $filters, $format, $documentNo);
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
    private function build(TabularReport $report, User $viewer, array $filters, string $format, ?string $documentNo = null): array
    {
        $query = $report->query($viewer, $filters);
        $summary = $report->summary($query, $filters);
        $sections = $report->exportSections($viewer, $filters);
        $scope = $report->scopeLines($filters);
        $name = DocumentName::make('Report', [str_replace('.', '-', $report->key())], $format);

        if ($format === 'xlsx') {
            $rows = (clone $query)->get();
            $report->hydrateRows($rows, $viewer, $filters);

            return ['name' => $name, 'rows' => $rows->count(), 'export' => new TabularReportExport($report, $summary, $rows, $sections, $scope, $viewer->name)];
        }

        $rows = (clone $query)->limit(self::PDF_ROW_LIMIT)->get();
        $report->hydrateRows($rows, $viewer, $filters);
        // Counted off the query, not the `total` tile: a grouped report's rows (one per request
        // type, per approver) are not what its headline total counts.
        $total = (clone $query)->toBase()->getCountForPagination();

        $company = CompanyProfile::get();
        $printedAt = DateDisplay::dateTime(now());
        $pdf = Pdf::loadView('pdf.reports.tabular', [
            'report' => $report,
            'summary' => $summary,
            'sections' => $sections,
            'scope' => $scope,
            'rows' => $rows,
            'truncated' => $total > $rows->count(),
            'total' => $total,
            'company' => $company,
            'documentNo' => $documentNo,
            'printedBy' => $viewer->name,
            'printedAt' => $printedAt,
        ])->setPaper('a4', $report->pdfOrientation());
        PdfFooter::stamp($pdf, $company['app_name'], "พิมพ์โดย {$viewer->name} เมื่อ {$printedAt}", 'หน้า {PAGE_NUM} / {PAGE_COUNT}');

        return ['name' => $name, 'rows' => $rows->count(), 'pdf' => $pdf];
    }
}
