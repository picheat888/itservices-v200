<?php

namespace Tests\Concerns;

use App\Exports\Report\TabularReportExport;
use App\Exports\Report\TabularRowsSheet;
use App\Models\Report\ReportExport;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Maatwebsite\Excel\Facades\Excel;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;

/**
 * Report export tests: exports are queued (POST → 202) and built by GenerateReportExport,
 * which runs inline under the test suite's sync queue. These helpers run that round trip.
 */
trait ExportsReports
{
    /**
     * Queue an export and, when the file was written, fetch it the way the SPA does (the
     * download endpoint). A refusal (403/422), or a workbook written under Excel::fake(),
     * comes back as the queue response itself.
     */
    protected function exportReport(string $url): TestResponse
    {
        Storage::fake('local');
        $response = $this->postJson($url);

        $export = $response->status() === 202 ? ReportExport::find($response->json('data.id')) : null;
        if ($export?->status === ReportExport::READY && Storage::disk('local')->exists($export->file_path)) {
            return $this->get("/api/reports/exports/{$export->id}/download");
        }

        return $response;
    }

    /** The newest export was built as $fileName; hand its workbook to the callback like Excel::assertStored. */
    protected function assertExportStored(string $fileName, ?callable $callback = null): void
    {
        $export = ReportExport::query()->latest('id')->firstOrFail();
        $this->assertSame(ReportExport::READY, $export->status, "Export failed: {$export->error}");
        $this->assertSame($fileName, $export->file_name);

        Excel::assertStored($export->file_path, 'local', $callback);
    }

    /** An Excel date cell read back as text ("2026-09-20 10:00"); null stays null. */
    protected function excelDate(mixed $cell, string $format = 'Y-m-d H:i'): ?string
    {
        $this->assertTrue($cell === null || is_float($cell), 'Expected an Excel date number, got '.var_export($cell, true));

        return $cell === null ? null : ExcelDate::excelToDateTimeObject($cell)->format($format);
    }

    /** The workbook's rows sheet ("ข้อมูลดิบ"), wherever it sits among the sheets. */
    protected function rowsSheet(TabularReportExport $export): TabularRowsSheet
    {
        return collect($export->sheets())->first(fn (object $sheet) => $sheet instanceof TabularRowsSheet);
    }
}
