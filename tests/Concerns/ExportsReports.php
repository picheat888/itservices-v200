<?php

namespace Tests\Concerns;

use App\Models\Report\ReportExport;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Maatwebsite\Excel\Facades\Excel;

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
}
