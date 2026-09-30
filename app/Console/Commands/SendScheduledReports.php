<?php

namespace App\Console\Commands;

use App\Services\Report\ReportScheduleService;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

/** Queues every scheduled report whose send time has come (Report Center Phase 6). */
class SendScheduledReports extends Command
{
    protected $signature = 'reports:send-scheduled';

    protected $description = 'Queue the scheduled report emails that are due';

    public function handle(ReportScheduleService $service): int
    {
        $this->info('Scheduled reports queued: '.$service->dispatchDue(CarbonImmutable::now()));

        return self::SUCCESS;
    }
}
