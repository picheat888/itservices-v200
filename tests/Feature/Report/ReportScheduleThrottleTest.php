<?php

// Scheduled report runs are spaced one per minute; a run held back waits instead of failing.

namespace Tests\Feature\Report;

use App\Jobs\SendScheduledReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportScheduleThrottleTest extends TestCase
{
    use RefreshDatabase;

    /** Pushes the job through its middleware; returns whether handle() would have run. */
    private function pass(SendScheduledReport $job): bool
    {
        $ran = false;
        $pipeline = array_reduce(
            array_reverse($job->middleware()),
            fn (callable $next, object $middleware) => fn (object $passed) => $middleware->handle($passed, $next),
            function () use (&$ran): void {
                $ran = true;
            },
        );
        $pipeline($job);

        return $ran;
    }

    private function job(int $scheduleId): SendScheduledReport
    {
        return (new SendScheduledReport($scheduleId, '2026-10-19T07:00:00+07:00'))->withFakeQueueInteractions();
    }

    public function test_a_backlog_goes_out_one_run_per_minute(): void
    {
        $this->travelTo('2026-10-19 09:00:00');

        $first = $this->job(1);
        $this->assertTrue($this->pass($first));
        $first->assertNotReleased();

        $second = $this->job(2);
        $this->assertFalse($this->pass($second));
        $second->assertReleased();

        $this->travel(61)->seconds();
        $this->assertTrue($this->pass($this->job(2)));
    }

    public function test_waiting_is_not_a_failure_but_an_error_or_timeout_is_final(): void
    {
        $this->travelTo('2026-10-19 09:00:00');
        $job = new SendScheduledReport(1, '2026-10-19T07:00:00+07:00');

        $this->assertFalse(property_exists($job, 'tries'), 'A fixed try count would fail a run that only waited.');
        $this->assertSame(1, $job->maxExceptions);
        $this->assertTrue($job->failOnTimeout);
        $this->assertEquals(now()->addDay()->getTimestamp(), $job->retryUntil()->getTimestamp());
    }
}
