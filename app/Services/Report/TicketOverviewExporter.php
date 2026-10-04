<?php

namespace App\Services\Report;

use App\Exports\Report\TicketOverviewExport;
use App\Models\Settings\AppSetting;
use App\Models\User;
use App\Support\DocumentName;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Storage;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\Response;

/**
 * Builds the file for the "Ticket & SLA overview" report. `download()` answers the request
 * directly; `store()` writes the same file to the private disk for a queued export
 * (GenerateReportExport) — both through one build path.
 */
class TicketOverviewExporter
{
    /** A PDF past this many rows stops being readable; the workbook carries everything. */
    public const PDF_ROW_LIMIT = 1000;

    public function __construct(private TicketOverviewReportService $reports, private TicketHistory $history) {}

    /**
     * @param  array{from: CarbonImmutable, to: CarbonImmutable, categories: list<string>, priority: ?string, department_id: ?int, assignee_id: ?int, source: ?string}  $filters
     */
    public function download(User $viewer, array $filters, string $format): Response
    {
        $file = $this->build($viewer, $filters, $format);

        return $format === 'xlsx'
            ? Excel::download($file['export'], $file['name'])
            : $file['pdf']->download($file['name']);
    }

    /**
     * Write the file under $directory on the local disk.
     *
     * @param  array{from: CarbonImmutable, to: CarbonImmutable, categories: list<string>, priority: ?string, department_id: ?int, assignee_id: ?int, source: ?string}  $filters
     * @return array{name: string, path: string, rows: int}
     */
    public function store(User $viewer, array $filters, string $format, string $directory): array
    {
        $file = $this->build($viewer, $filters, $format);
        $path = "{$directory}/{$file['name']}";

        $format === 'xlsx'
            ? Excel::store($file['export'], $path, 'local')
            : Storage::disk('local')->put($path, $file['pdf']->output());

        return ['name' => $file['name'], 'path' => $path, 'rows' => $file['rows']];
    }

    /**
     * @param  array{from: CarbonImmutable, to: CarbonImmutable, categories: list<string>, priority: ?string, department_id: ?int, assignee_id: ?int, source: ?string}  $filters
     * @return array{name: string, rows: int, export?: TicketOverviewExport, pdf?: \Barryvdh\DomPDF\PDF}
     */
    private function build(User $viewer, array $filters, string $format): array
    {
        $summary = $this->reports->summary($viewer, $filters);
        $name = DocumentName::make('TicketReport', [$summary['range']['from'], $summary['range']['to']], $format);

        if ($format === 'xlsx') {
            // The workbook also carries the raw data sheets, which read further than the list does.
            $rows = $this->reports->exportRows($viewer, $filters)
                ->load(['relatedAsset:id,asset_code', 'serviceRequest:id,ticket_id,reference'])
                ->loadCount(['updates', 'attachments']);

            return ['name' => $name, 'rows' => $rows->count(), 'export' => new TicketOverviewExport($summary, $rows, $this->history->for($rows))];
        }

        $rows = $this->reports->exportRows($viewer, $filters, self::PDF_ROW_LIMIT);
        $pdf = Pdf::loadView('pdf.reports.ticket-overview', [
            'summary' => $summary,
            'rows' => $rows,
            'truncated' => $summary['kpi']['total'] > $rows->count(),
            'company' => AppSetting::get('company_name', ''),
            'printedBy' => $viewer->name,
        ])->setPaper('a4', 'landscape');

        return ['name' => $name, 'rows' => $rows->count(), 'pdf' => $pdf];
    }
}
