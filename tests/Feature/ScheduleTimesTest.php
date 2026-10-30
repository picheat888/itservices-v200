<?php

// Every entry in routes/console.php keeps its pinned cron time, so a moved sweep shows up as a failing test (SET-18).

namespace Tests\Feature;

use Illuminate\Console\Scheduling\Schedule;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ScheduleTimesTest extends TestCase
{
    /** @return array<string, array{0: string, 1: string}> */
    public static function entries(): array
    {
        return [
            'contract expiry alerts' => ['contracts:send-expiry-alerts', '0 8 * * *'],
            'contract weekly digest' => ['contracts:send-weekly-digest', '20 8 * * 1'],
            'stock notifications' => ['stock:send-notifications', '5 8 * * *'],
            'stock weekly digest' => ['stock:send-weekly-digest', '25 8 * * 1'],
            'stalled request reminders' => ['requests:send-stalled-reminders', '10 8 * * *'],
            'stalled request digest' => ['requests:send-stalled-digest', '0 12 * * 1'],
            'ticket sla alerts' => ['tickets:send-sla-alerts', '*/10 * * * *'],
            'ticket weekly digest' => ['tickets:send-weekly-digest', '30 8 * * 1'],
            'sla holiday reminder december' => ['tickets:remind-sla-holidays', '0 8 1,15 12 *'],
            'sla holiday reminder january' => ['tickets:remind-sla-holidays', '0 8 2 1 *'],
            'log retention' => ['logs:prune', '0 2 * * *'],
            'report export retention' => ['reports:prune-exports', '15 2 * * *'],
            'cache prune' => ['cache:prune-expired', '30 2 * * *'],
            'scheduled reports' => ['reports:send-scheduled', '*/5 * * * *'],
            'geoip refresh' => ['geoip:update', '30 3 3 * *'],
            'log digest' => ['logs:digest', '0 7 * * 1'],
            'scheduler heartbeat' => ['scheduler-heartbeat', '* * * * *'],
        ];
    }

    #[DataProvider('entries')]
    public function test_every_scheduled_command_runs_at_its_time(string $command, string $expression): void
    {
        // A command may run on several lines (the holiday reminder), so each line is matched by its time too
        $events = collect(app(Schedule::class)->events())->filter(
            fn ($event) => (str_contains((string) $event->command, $command) || $event->description === $command)
                && $event->expression === $expression
        );

        $this->assertCount(1, $events);
    }

    public function test_no_scheduled_entry_is_left_unpinned(): void
    {
        $this->assertCount(count(self::entries()), app(Schedule::class)->events());
    }
}
