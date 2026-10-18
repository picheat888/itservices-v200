<?php

namespace App\Services\Report;

use App\Exports\Report\TicketOverviewExport;
use App\Models\User;
use App\Support\CompanyProfile;
use App\Support\DateDisplay;
use App\Support\DocumentName;
use App\Support\PdfFooter;
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
    public function download(User $viewer, array $filters, string $format, ?string $documentNo = null): Response
    {
        $file = $this->build($viewer, $filters, $format, $documentNo);

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
    public function store(User $viewer, array $filters, string $format, string $directory, ?string $documentNo = null): array
    {
        $file = $this->build($viewer, $filters, $format, $documentNo);
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
    private function build(User $viewer, array $filters, string $format, ?string $documentNo = null): array
    {
        $summary = $this->reports->summary($viewer, $filters);
        $name = DocumentName::make('TicketReport', [$summary['range']['from'], $summary['range']['to']], $format);

        if ($format === 'xlsx') {
            // The workbook also carries the raw data sheets, which read further than the list does.
            $rows = $this->reports->exportRows($viewer, $filters)
                ->load(['relatedAsset:id,asset_code', 'serviceRequest:id,ticket_id,reference'])
                ->loadCount(['updates', 'attachments']);

            return ['name' => $name, 'rows' => $rows->count(), 'export' => new TicketOverviewExport($summary, $rows, $this->history->for($rows), $viewer->name)];
        }

        $rows = $this->reports->exportRows($viewer, $filters, self::PDF_ROW_LIMIT);
        $company = CompanyProfile::get();
        $pdf = Pdf::loadView('pdf.reports.ticket-overview', [
            'summary' => $summary,
            'scope' => $this->scopeLines($filters, $summary['options']),
            'rows' => $rows,
            'truncated' => $summary['kpi']['total'] > $rows->count(),
            'company' => $company,
            'documentNo' => $documentNo,
            'printedBy' => $viewer->name,
            'dateConfig' => DateDisplay::config(),
        ])->setPaper('a4', 'landscape');
        PdfFooter::stamp($pdf, $company['app_name'], "พิมพ์โดย {$viewer->name} เมื่อ ".DateDisplay::dateTime(now()), 'หน้า {PAGE_NUM} / {PAGE_COUNT}');

        return ['name' => $name, 'rows' => $rows->count(), 'pdf' => $pdf];
    }

    /**
     * Every filter besides the dates as [label, value]; one "ไม่ได้กรอง" line when none narrows the tickets.
     *
     * @param  array<string, mixed>  $filters
     * @param  array<string, mixed>  $options
     * @return list<array{0: string, 1: string}>
     */
    private function scopeLines(array $filters, array $options): array
    {
        $nameOf = function (array $list, ?int $id): ?string {
            foreach ($list as $entry) {
                if ((int) $entry['id'] === $id) {
                    return ($entry['name_th'] ?? null) ?: $entry['name'];
                }
            }

            return null;
        };

        $lines = array_filter([
            $filters['categories'] !== [] ? ['หมวด', implode(', ', array_map(fn (string $c) => TicketLabels::category($c), $filters['categories']))] : null,
            $filters['priority'] ? ['ความสำคัญ', TicketLabels::priority($filters['priority'])] : null,
            $filters['department_id'] ? ['แผนก', $nameOf($options['departments'] ?? [], $filters['department_id']) ?? (string) $filters['department_id']] : null,
            $filters['assignee_id'] ? ['ผู้รับผิดชอบ', $nameOf($options['assignees'] ?? [], $filters['assignee_id']) ?? (string) $filters['assignee_id']] : null,
            $filters['source'] ? ['ที่มา', TicketLabels::source($filters['source']) ?? $filters['source']] : null,
        ]);

        return array_values($lines) ?: [['ตัวกรอง', 'ไม่ได้กรอง']];
    }
}
