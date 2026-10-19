<?php

namespace App\Jobs;

use App\Models\Report\ReportExport;
use App\Models\Report\ReportSchedule;
use App\Services\Report\ReportScheduleService;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\RateLimited;
use Throwable;

/**
 * Builds and mails one run of a scheduled report (App\Models\Report\ReportSchedule) in the
 * worker. `$runAt` is the slot the run is for — it decides the period the file covers, so a
 * run picked up late still reports on the right day, week or month. Rate limited so a
 * backlog goes out spaced; any failure is final, since a retry would mail recipients twice.
 */
class SendScheduledReport implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public const LIMITER = 'report-schedules';

    public int $maxExceptions = 1;

    public int $timeout = 600;

    public bool $failOnTimeout = true;

    public function __construct(public int $scheduleId, public string $runAt)
    {
        $this->onQueue(ReportExport::QUEUE);
    }

    /** @return array<int, object> */
    public function middleware(): array
    {
        return [new RateLimited(self::LIMITER)];
    }

    /** Waiting for the limiter is not a failure; give a long backlog a day to drain. */
    public function retryUntil(): DateTimeInterface
    {
        return now()->addDay();
    }

    public function handle(ReportScheduleService $service): void
    {
        ini_set('memory_limit', GenerateReportExport::MEMORY_LIMIT);

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
