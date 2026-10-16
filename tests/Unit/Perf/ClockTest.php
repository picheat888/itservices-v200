<?php

namespace Tests\Unit\Perf;

use App\Support\Perf\Clock;
use App\Support\Perf\Rng;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\TestCase;

// Unit tests for the three-year dataset clock
class ClockTest extends TestCase
{
    private function clock(): Clock
    {
        return new Clock(CarbonImmutable::parse('2026-10-16 08:00:00'));
    }

    public function test_moments_stay_inside_range_and_office_hours(): void
    {
        $c = $this->clock();
        $r = new Rng(1);
        $weekend = 0;
        for ($i = 0; $i < 5000; $i++) {
            $m = $c->moment($r);
            $this->assertTrue($c->within($m));
            $this->assertGreaterThanOrEqual(9, $m->hour);
            $this->assertLessThanOrEqual(18, $m->hour);
            $weekend += $m->isWeekend() ? 1 : 0;
        }
        $this->assertLessThan(500, $weekend);
    }

    public function test_every_month_has_weight(): void
    {
        $w = $this->clock()->monthWeights();
        $this->assertCount(36, $w);
        $this->assertLessThan($w['2026-01'], $w['2025-12']);
    }

    public function test_after_never_passes_end(): void
    {
        $c = $this->clock();
        $t = $c->after($c->end()->subMinutes(5), new Rng(2), 60, 600);
        $this->assertTrue($t <= $c->end());
    }
}
