<?php

namespace Tests\Feature\Report;

use App\Models\Permission\Role;
use App\Models\User;
use App\Services\Report\Tabular\ThaiWords;
use App\Support\ReportCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Every summary tile of every tabular report says what it counts: the page's ⓘ and the PDF's
 * explanation page read the same words from the lang files.
 */
class TileInfoTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_tile_of_every_tabular_report_has_its_words(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $viewer = User::factory()->create(['role' => 'super']);
        $missing = [];

        foreach (array_keys(ReportCatalogue::definitions()) as $key) {
            $report = ReportCatalogue::tabular($key);
            if ($report === null) {
                continue;
            }
            $filters = $report->resolveFilters([]);
            foreach ($report->summary($report->query($viewer, $filters), $filters) as $tile) {
                $info = $report->tileInfoKey($tile->key);
                if ($info === null || ThaiWords::get($info) === null) {
                    $missing[] = "{$key}.{$tile->key}";
                }
            }
        }

        $this->assertSame([], $missing);
    }

    public function test_the_rows_endpoint_hands_the_page_each_tiles_info_key(): void
    {
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $summary = collect($this->actingAs(User::factory()->create(['role' => 'super']))
            ->getJson('/api/reports/tabular/tickets.backlog/summary')->assertOk()->json('data.summary'))->keyBy('key');

        $this->assertSame('rep_info_tickets_backlog_over_sla', $summary['over_sla']['info_key']);
    }

    public function test_a_window_tile_shares_one_explanation_and_pdf_labels_follow_the_page(): void
    {
        $warranty = ReportCatalogue::tabular('assets.warranty_expiring');
        $this->assertSame('rep_info_assets_warranty_expiring_wty_within', $warranty->tileInfoKey('wty_within_90d'));
        $this->assertSame('rep_info_assets_warranty_expiring_wty_within', $warranty->tileInfoKey('wty_within_365d'));

        $this->assertSame('รายการที่มีของ', ReportCatalogue::tabular('stock.valuation')->tileLabels()['total']);
        $this->assertSame('เกินกำหนด ยังไม่ปิด', ReportCatalogue::tabular('contracts.renewals')->tileLabels()['overdue']);
    }
}
