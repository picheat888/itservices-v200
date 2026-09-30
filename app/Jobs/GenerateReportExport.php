<?php

namespace App\Jobs;

use App\Models\Report\ReportExport;
use App\Services\Report\ReportExportService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Throwable;

/**
 * Builds one queued report file (App\Models\Report\ReportExport) in the worker, so a large
 * workbook or PDF never holds up a web request. Carries the id only: the row holds what was
 * asked for, and a row deleted before the worker gets to it is simply skipped.
 *
 * One try — a report that fails once fails the same way again, and the requester has a
 * Retry button for anything transient.
 */
class GenerateReportExport implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    /** Seconds — a whole-year workbook of every ticket still finishes well inside this. */
    public int $timeout = 600;

    public function __construct(public int $exportId) {}

    public function handle(ReportExportService $service): void
    {
        $export = ReportExport::find($this->exportId);
        if ($export !== null) {
            $service->build($export);
        }
    }

    /** A worker that times out or dies never reaches build()'s own catch — record it here. */
    public function failed(?Throwable $exception): void
    {
        $export = ReportExport::find($this->exportId);
        if ($export !== null && in_array($export->status, [ReportExport::QUEUED, ReportExport::RUNNING], true)) {
            app(ReportExportService::class)->fail($export, 'build_failed');
        }
    }
}
