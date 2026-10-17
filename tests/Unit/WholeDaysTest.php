<?php

namespace Tests\Unit;

use App\Services\Report\Request\ApprovalFacts;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\TestCase;

// wholeDays counts calendar days between two moments; the fast version must agree with the Carbon one
class WholeDaysTest extends TestCase
{
    private function wholeDays(CarbonInterface $from, CarbonInterface $to): int
    {
        return (fn () => self::wholeDays($from, $to))->bindTo(null, ApprovalFacts::class)();
    }

    private function reference(CarbonInterface $from, CarbonInterface $to): int
    {
        return (int) $from->copy()->startOfDay()->diffInDays($to->copy()->startOfDay(), false);
    }

    public function test_agrees_with_the_carbon_version_over_random_pairs(): void
    {
        mt_srand(11);
        foreach (['Asia/Bangkok', 'UTC', 'America/New_York'] as $tz) {
            for ($i = 0; $i < 600; $i++) {
                $a = Carbon::create(2020, 1, 1, 0, 0, 0, $tz)->addSeconds(mt_rand(0, 10 * 365 * 86400));
                $b = Carbon::create(2020, 1, 1, 0, 0, 0, $tz)->addSeconds(mt_rand(0, 10 * 365 * 86400));
                $this->assertSame($this->reference($a, $b), $this->wholeDays($a, $b), "{$a} to {$b} in {$tz}");
            }
        }
    }

    public function test_same_day_is_zero_and_earlier_is_negative_and_month_ends_cross(): void
    {
        $a = Carbon::parse('2026-02-28 23:59:59');
        $this->assertSame(0, $this->wholeDays($a, Carbon::parse('2026-02-28 00:00:01')));
        $this->assertSame(1, $this->wholeDays($a, Carbon::parse('2026-03-01 00:00:00')));
        $this->assertSame(-1, $this->wholeDays(Carbon::parse('2026-03-01 08:00:00'), $a));
        $this->assertSame(366, $this->wholeDays(Carbon::parse('2024-02-29'), Carbon::parse('2025-03-01')));
    }
}
