<?php

namespace Tests\Feature;

use App\Support\OverviewPeriod;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

// The Overview tabs' period: presets, a custom range, all time, and its chart columns.
class OverviewPeriodTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-10-14 12:00:00');
    }

    private function period(array $query): OverviewPeriod
    {
        return OverviewPeriod::fromRequest(Request::create('/x', 'GET', $query));
    }

    public function test_no_params_and_unknown_days_mean_all_time(): void
    {
        $this->assertTrue($this->period([])->isAllTime());
        $this->assertTrue($this->period(['days' => 'all'])->isAllTime());
        $this->assertTrue($this->period(['days' => 365])->isAllTime());
    }

    public function test_a_preset_runs_back_from_now(): void
    {
        $period = $this->period(['days' => 30]);

        $this->assertSame('2026-09-14 12:00:00', $period->from->format('Y-m-d H:i:s'));
        $this->assertTrue($period->contains(CarbonImmutable::parse('2026-10-01')));
        $this->assertFalse($period->contains(CarbonImmutable::parse('2026-09-01')));
    }

    public function test_a_custom_range_covers_whole_days_and_is_validated(): void
    {
        $period = $this->period(['from' => '2026-01-05', 'to' => '2026-01-09']);

        $this->assertTrue($period->contains(CarbonImmutable::parse('2026-01-09 23:59:00')));
        $this->assertFalse($period->contains(CarbonImmutable::parse('2026-01-10 00:00:00')));

        $this->expectException(ValidationException::class);
        $this->period(['from' => '2026-01-09', 'to' => '2026-01-05']);
    }

    public function test_columns_grow_coarser_with_the_span(): void
    {
        $this->assertSame('day', $this->period(['days' => 7])->columns(null)['unit']);
        $this->assertSame('week', $this->period(['days' => 90])->columns(null)['unit']);
        $this->assertSame('month', $this->period(['from' => '2025-01-01', 'to' => '2026-10-14'])->columns(null)['unit']);

        $all = OverviewPeriod::allTime()->columns(CarbonImmutable::parse('2019-03-02'));
        $this->assertSame('year', $all['unit']);
        $this->assertSame(['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'], array_column($all['columns'], 'start'));
    }

    public function test_week_columns_run_sunday_to_saturday_like_the_date_pickers(): void
    {
        // Wednesday 2026-09-30 → the first week starts on Sunday 2026-09-27.
        $columns = $this->period(['from' => '2026-09-30', 'to' => '2026-10-20'])->columns(null)['columns'];

        $this->assertSame(['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18'], array_column($columns, 'start'));
        $this->assertSame('2026-10-03 23:59:59', $columns[0]['to']->toDateTimeString());
    }

    public function test_count_into_drops_dates_outside_the_period(): void
    {
        $counted = $this->period(['days' => 7])->countInto([
            CarbonImmutable::parse('2026-10-08 09:00'),
            CarbonImmutable::parse('2026-10-14 08:00'),
            CarbonImmutable::parse('2026-10-14 09:00'),
            CarbonImmutable::parse('2026-09-01 09:00'),
            null,
        ], null);

        $this->assertSame('day', $counted['unit']);
        $this->assertSame(['month' => '2026-10-14', 'count' => 2], end($counted['data']));
        $this->assertSame(3, array_sum(array_column($counted['data'], 'count')));
    }
}
