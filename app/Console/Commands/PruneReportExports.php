<?php

namespace App\Console\Commands;

use App\Services\Report\ReportExportService;
use App\Services\Report\ReportScheduleService;
use Illuminate\Console\Command;

/** Nightly sweep of queued report files past their 7-day window (and exports whose worker died). */
class PruneReportExports extends Command
{
    protected $signature = 'reports:prune-exports';

    protected $description = 'Delete report export files past their expiry, exports left stuck in the queue, and leftover scheduled-run folders';

    public function handle(ReportExportService $service, ReportScheduleService $schedules): int
    {
        $this->info('Pruned report exports: '.$service->prune());
        $this->info('Pruned scheduled-run folders: '.$schedules->pruneLeftovers());

        return self::SUCCESS;
    }
}
