<?php

namespace Database\Seeders\Demo;

use Illuminate\Support\Carbon;

/**
 * The demo's sense of time. Every event is placed relative to one base moment (the
 * start of the run) and performed "then" via Carbon::setTestNow(), so created_at,
 * SLA deadlines, became_current_at and document numbers all read as history.
 *
 * Office-hours days only: a day that lands on a weekend moves back to Friday, and no
 * moment is ever later than the base — a run on Sunday morning still has no future rows.
 */
final class DemoClock
{
    private Carbon $base;

    public function __construct(?Carbon $base = null)
    {
        $this->base = ($base ?? Carbon::now())->copy()->startOfMinute();
    }

    public function base(): Carbon
    {
        return $this->base->copy();
    }

    public function daysAgo(int $days, int $hour = 9, int $minute = 0): Carbon
    {
        $moment = $this->base->copy()->subDays($days)->setTime($hour, $minute);
        while ($moment->isWeekend()) {
            $moment->subDay();
        }

        return $moment->greaterThan($this->base) ? $this->base->copy()->subMinutes(5) : $moment;
    }

    public function hoursAgo(int $hours): Carbon
    {
        return $this->base->copy()->subHours($hours);
    }

    public function at(Carbon $moment): void
    {
        Carbon::setTestNow($moment);
    }

    public function reset(): void
    {
        Carbon::setTestNow();
    }
}
