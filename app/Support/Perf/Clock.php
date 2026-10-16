<?php

namespace App\Support\Perf;

use Carbon\CarbonImmutable;

/** The dataset's three-year window: whole months up to the end moment, with seasonal weights. */
class Clock
{
    public function __construct(private readonly CarbonImmutable $end) {}

    public function end(): CarbonImmutable
    {
        return $this->end;
    }

    public function start(): CarbonImmutable
    {
        return $this->end->subYears(3)->startOfMonth()->addMonth();
    }

    public function within(CarbonImmutable $t): bool
    {
        return $t >= $this->start() && $t <= $this->end;
    }

    /** @return array<string,float> keyed Y-m, 36 months */
    public function monthWeights(): array
    {
        $weights = [];
        $month = $this->start();
        for ($i = 0; $i < 36; $i++) {
            $w = [0.8, 1.0, 1.2][intdiv($i, 12)];
            $w *= match ($month->month) {
                1, 2, 6, 7 => 1.3,
                12 => 0.7,
                default => 1.0,
            };
            $weights[$month->format('Y-m')] = $w;
            $month = $month->addMonth();
        }

        return $weights;
    }

    // A weighted month, a random day (weekends kept to ~5%), office hours
    public function moment(Rng $rng): CarbonImmutable
    {
        $first = CarbonImmutable::createFromFormat('Y-m-d H:i:s', $rng->weighted($this->monthWeights()).'-01 00:00:00');
        $lastDay = $first->isSameMonth($this->end) ? $this->end->day - ($this->end->hour < 9 ? 1 : 0) : $first->daysInMonth;
        $day = $first->addDays($rng->int(1, $lastDay) - 1);
        if ($day->isWeekend() && ! $rng->chance(0.05)) {
            $day = $day->subDays($day->isSaturday() ? 1 : 2);
        }
        $t = $day->setTime($rng->int(9, 18), $rng->int(0, 59), $rng->int(0, 59));

        return min(max($t, $this->start()), $this->end);
    }

    public function after(CarbonImmutable $from, Rng $rng, int $minMinutes, int $maxMinutes): CarbonImmutable
    {
        return min($from->addMinutes($rng->int($minMinutes, $maxMinutes)), $this->end);
    }
}
