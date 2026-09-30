<?php

namespace App\Console\Commands;

use App\Services\Report\ReportExportService;
use Illuminate\Console\Command;

/** Nightly sweep of queued report files past their 7-day window (and exports whose worker died). */
class PruneReportExports extends Command
{
    protected $signature = 'reports:prune-exports';

    protected $description = 'Delete report export files past their expiry, and exports left stuck in the queue';

    public function handle(ReportExportService $service): int
    {
        $this->info('Pruned report exports: '.$service->prune());

        return self::SUCCESS;
    }
}
