<?php

// Pins listed company holidays (sla_holidays) as non-working days on the business-time clock only.

namespace Tests\Feature;

use App\Enums\Ticket\TicketSlaClock;
use App\Models\Settings\SlaHoliday;
use App\Support\TicketSla;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TicketSlaHolidayTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('Asia/Bangkok', date_default_timezone_get());
        $this->travelTo(Carbon::parse('2026-04-01 09:00:00'));
        TicketSla::flush();
    }

    protected function tearDown(): void
    {
        TicketSla::flush();
        parent::tearDown();
    }

    /** @param list<string> $dates */
    private function holidays(array $dates): void
    {
        foreach ($dates as $date) {
            SlaHoliday::factory()->create(['date' => $date]);
        }
    }

    private function format(Carbon $at): string
    {
        return $at->format('Y-m-d H:i');
    }

    public function test_a_listed_weekday_is_skipped(): void
    {
        $this->holidays(['2026-05-01', '2026-05-04']);

        $due = TicketSla::addBusinessMinutes(Carbon::parse('2026-04-30 16:00'), 480);

        $this->assertSame('2026-05-05 16:00', $this->format($due));
    }

    public function test_a_long_run_of_holidays_does_not_stop_the_walk(): void
    {
        $dates = [];
        for ($day = Carbon::parse('2026-04-13'); $day->lte(Carbon::parse('2026-04-24')); $day->addDay()) {
            $dates[] = $day->toDateString();
        }
        $this->assertCount(12, $dates);
        $this->holidays($dates);

        $due = TicketSla::addBusinessMinutes(Carbon::parse('2026-04-10 16:00'), 120);

        $this->assertSame('2026-04-27 09:00', $this->format($due));
    }

    public function test_a_holiday_on_a_weekly_day_off_changes_nothing(): void
    {
        $without = TicketSla::addBusinessMinutes(Carbon::parse('2026-12-04 16:00'), 120);

        $this->holidays(['2026-12-05']);
        $with = TicketSla::addBusinessMinutes(Carbon::parse('2026-12-04 16:00'), 120);

        $this->assertSame('2026-12-07 09:00', $this->format($with));
        $this->assertSame($this->format($without), $this->format($with));
    }

    public function test_the_local_calendar_day_decides(): void
    {
        $this->holidays(['2026-05-01']);

        $minutes = TicketSla::businessMinutesBetween(Carbon::parse('2026-05-01 00:30'), Carbon::parse('2026-05-01 23:00'));

        $this->assertSame(0, $minutes);
    }

    public function test_calendar_clock_ignores_holidays(): void
    {
        $this->holidays(['2026-05-01']);

        $due = TicketSla::addMinutesOn(Carbon::parse('2026-04-30 16:00'), 1440, TicketSlaClock::Calendar);

        $this->assertSame('2026-05-01 16:00', $this->format($due));
    }

    public function test_saving_or_deleting_a_holiday_flushes_the_memo(): void
    {
        $from = Carbon::parse('2026-04-30 16:00');
        $this->assertSame('2026-05-01 16:00', $this->format(TicketSla::addBusinessMinutes($from, 480)));

        $holiday = SlaHoliday::create(['date' => '2026-05-01', 'name' => 'Labour Day']);
        $this->assertSame('2026-05-04 16:00', $this->format(TicketSla::addBusinessMinutes($from, 480)));

        $holiday->delete();
        $this->assertSame('2026-05-01 16:00', $this->format(TicketSla::addBusinessMinutes($from, 480)));
    }
}
