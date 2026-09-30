<?php

namespace App\Jobs;

use App\Models\Report\ReportSchedule;
use App\Services\Report\ReportScheduleService;
use Carbon\CarbonImmutable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Throwable;

/**
 * Builds and mails one run of a scheduled report (App\Models\Report\ReportSchedule) in the
 * worker. `$runAt` is the slot the run is for — it decides the period the file covers, so a
 * run picked up late still reports on the right day, week or month. One try: a retry would
 * mail the same recipients twice.
 */
class SendScheduledReport implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public int $timeout = 600;

    public function __construct(public int $scheduleId, public string $runAt) {}

    public function handle(ReportScheduleService $service): void
    {
        $schedule = ReportSchedule::find($this->scheduleId);
        if ($schedule !== null) {
            $service->run($schedule, CarbonImmutable::parse($this->runAt));
        }
    }

    /** A worker that times out or dies never reaches run()'s own catch — record it here. */
    public function failed(?Throwable $exception): void
    {
        $schedule = ReportSchedule::find($this->scheduleId);
        if ($schedule !== null) {
            app(ReportScheduleService::class)->finish($schedule, ReportSchedule::FAILED, 'build_failed');
        }
    }
}
