<?php

namespace Tests\Feature\Report;

use App\Services\Report\Tabular\ThaiWords;
use App\Services\Report\Ticket\TicketManualSlaReport;
use App\Support\DateDisplay;
use App\Support\ReportCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The dates and filters a tabular report file says it covers (TabularReport::scopeLines),
 * named with the page's own Thai words.
 */
class ReportFileScopeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-09-25 10:00:00');
    }

    public function test_every_filter_and_option_of_every_tabular_report_has_thai_words(): void
    {
        $missing = [];
        foreach (ReportCatalogue::definitions() as $key => $definition) {
            if ($definition['kind'] !== 'tabular') {
                continue;
            }
            foreach (ReportCatalogue::tabular($key)->filters() as $filter) {
                $keys = [$filter->toArray()['label_key'], ...array_filter(array_column($filter->options, 'label_key'))];
                foreach ($keys as $wordKey) {
                    if (ThaiWords::get($wordKey) === null) {
                        $missing[] = "{$key}: {$wordKey}";
                    }
                }
            }
        }

        $this->assertSame([], $missing);
    }

    public function test_an_unfiltered_report_gives_its_range_and_says_it_is_not_filtered(): void
    {
        $report = app(TicketManualSlaReport::class);

        $this->assertSame([
            ['ช่วงวันที่', DateDisplay::range('2026-01-01', '2026-09-25')],
            ['ตัวกรอง', 'ไม่ได้กรอง'],
        ], $report->scopeLines($report->resolveFilters([])));
    }

    public function test_a_reversed_range_reads_the_right_way_round_and_view_settings_are_left_out(): void
    {
        $report = app(TicketManualSlaReport::class);
        $lines = $report->scopeLines($report->resolveFilters(['from' => '2026-09-01', 'to' => '2026-08-01', 'by' => 'priority', 'priority' => 'none']));

        $this->assertSame([
            ['ช่วงวันที่', DateDisplay::range('2026-08-01', '2026-09-01')],
            [ThaiWords::get('rep_fl_priority'), ThaiWords::get('rep_ms_prio_none')],
        ], $lines);
    }
}
