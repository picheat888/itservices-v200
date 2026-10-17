<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Exports\Report\TabularRowsSheet;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Category;
use App\Models\Settings\Unit;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * The three stock tabular reports — "รับเข้าและเบิกจ่าย" (stock.movements),
 * "ต่ำกว่าขั้นต่ำและเกินขั้นสูง" (stock.below_min) and "มูลค่าคงคลัง" (stock.valuation) — through the
 * generic /reports/tabular/{key} endpoints.
 */
class StockReportsTest extends TestCase
{
    use ExportsReports, RefreshDatabase;
    use GrantsReports;

    private int $docSeq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $this->travelTo('2026-09-25 10:00:00');
    }

    /** @param list<string> $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key]);
    }

    /** @param array<string, mixed> $attributes */
    private function item(array $attributes = []): StockItem
    {
        $category = Category::firstOrCreate(['name' => 'Spare parts'], ['name_th' => 'อะไหล่']);
        $unit = Unit::firstOrCreate(['name' => 'pcs']);

        return StockItem::create(array_merge([
            'sku' => 'SKU-'.str_pad((string) (StockItem::count() + 1), 7, '0', STR_PAD_LEFT),
            'name' => 'Item', 'category_id' => $category->id, 'unit_id' => $unit->id,
            'min_stock' => 0, 'max_stock' => 100,
        ], $attributes));
    }

    /** @param array<string, mixed> $attributes */
    private function movement(StockItem $item, string $type, int $qty, string $movedAt, array $attributes = []): StockMovement
    {
        return StockMovement::create(array_merge([
            'doc_no' => 'DOC-'.(++$this->docSeq), 'type' => $type, 'stock_item_id' => $item->id,
            'qty' => $qty, 'moved_at' => $movedAt, 'recorded_by' => 'IT Staff',
        ], $attributes));
    }

    private function lot(StockItem $item, int $received, int $remaining, float $cost, string $receivedAt): StockLot
    {
        return StockLot::create([
            'stock_item_id' => $item->id, 'unit_cost' => $cost,
            'qty_received' => $received, 'qty_remaining' => $remaining, 'received_at' => $receivedAt,
        ]);
    }

    // ── stock.movements ─────────────────────────────────────────────────────────────

    public function test_movements_default_to_the_last_twelve_months_in_date_order_with_totals(): void
    {
        $item = $this->item(['name' => 'SSD 1TB']);
        $this->movement($item, 'receive', 7, '2025-09-30 09:00:00', ['unit_cost' => 10]);
        $receive = $this->movement($item, 'receive', 10, '2026-09-02 09:00:00', ['unit_cost' => 1500, 'to_label' => 'Main']);
        $issue = $this->movement($item, 'issue', 3, '2026-09-10 09:00:00', ['from_label' => 'Main', 'to_label' => 'Somchai']);
        $transfer = $this->movement($item, 'transfer', 2, '2026-09-12 09:00:00', ['from_label' => 'Main', 'to_label' => 'Branch']);
        $adjust = $this->movement($item, 'adjust_down', 1, '2026-09-20 09:00:00');

        $body = $this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->getJson('/api/reports/tabular/stock.movements/rows')->assertOk()->json();

        $this->assertSame([$receive->id, $issue->id, $transfer->id, $adjust->id], array_column($body['data'], 'id'));
        $first = $body['data'][0];
        $this->assertSame('receive', $first['type']);
        $this->assertSame('SSD 1TB', $first['item_name']);
        $this->assertEqualsWithDelta(15000.0, $first['line_value'], 0.001);
        // No lot and no item cost: an issue is worth 0.
        $this->assertEqualsWithDelta(0.0, $body['data'][1]['line_value'], 0.001);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(4, $summary['total']['value']);
        // The file headline repeats the page tiles: pieces and value per movement type.
        $this->assertSame(['total', 'receive_qty', 'receive_value', 'issue_qty', 'issue_value', 'return_qty', 'transfer_qty', 'adjust_net'], $summary->keys()->all());
        $this->assertSame(10, $summary['receive_qty']['value']);
        $this->assertEqualsWithDelta(15000.0, $summary['receive_value']['value'], 0.001);
        $this->assertSame(3, $summary['issue_qty']['value']);
        $this->assertSame(0, $summary['return_qty']['value']);
        $this->assertSame(2, $summary['transfer_qty']['value']);
        $this->assertSame(-1, $summary['adjust_net']['value']);
    }

    public function test_movements_filter_by_range_type_warehouse_and_search(): void
    {
        $user = $this->userWith([...$this->reportRights('stock')]);
        $branch = Warehouse::create(['name' => 'Branch']);
        $ssd = $this->item(['name' => 'SSD 1TB']);
        $ram = $this->item(['name' => 'RAM 16GB']);
        $old = $this->movement($ssd, 'receive', 5, '2026-08-15 09:00:00', ['to_label' => 'Main']);
        $intoBranch = $this->movement($ssd, 'transfer', 2, '2026-09-05 09:00:00', ['from_label' => 'Main', 'to_label' => 'Branch']);
        $outOfBranch = $this->movement($ram, 'issue', 1, '2026-09-06 09:00:00', ['from_label' => 'Branch', 'to_label' => 'Somchai']);
        $this->movement($ram, 'receive', 4, '2026-09-07 09:00:00', ['to_label' => 'Main']);

        $ids = fn (string $query) => array_column($this->actingAs($user)->getJson('/api/reports/tabular/stock.movements/rows?'.$query)->assertOk()->json('data'), 'id');

        $this->assertSame([$old->id], $ids('from=2026-08-01&to=2026-08-31'));
        // A reversed range reads the right way round.
        $this->assertSame([$old->id], $ids('from=2026-08-31&to=2026-08-01'));
        $this->assertSame([$intoBranch->id], $ids('type=transfer'));
        $this->assertSame([$intoBranch->id, $outOfBranch->id], $ids('warehouse_id='.$branch->id));
        $this->assertSame([$outOfBranch->id, $outOfBranch->id + 1], $ids('search=RAM'));

        $this->actingAs($user)->getJson('/api/reports/tabular/stock.movements/rows?from=25-09-2026')->assertUnprocessable();
    }

    public function test_stock_reports_need_the_stock_report_switch(): void
    {
        $this->actingAs($this->userWith(['stock.module', 'stock.view', 'stock.view_events', ...$this->reportRights('assets')]))->getJson('/api/reports/tabular/stock.movements/rows')->assertForbidden();
        $this->actingAs($this->userWith(['stock.module', 'stock.view', 'stock.view_events', ...$this->reportRights('assets')]))->getJson('/api/reports/tabular/stock.below_min/rows')->assertForbidden();
    }

    // ── stock.below_min ─────────────────────────────────────────────────────────────

    public function test_below_min_lists_out_then_low_then_over_max(): void
    {
        $out = $this->item(['name' => 'Toner', 'current_stock' => 0, 'min_stock' => 5, 'max_stock' => 20]);
        $low = $this->item(['name' => 'Mouse', 'current_stock' => 2, 'min_stock' => 5, 'max_stock' => 10]);
        $this->item(['name' => 'Cable', 'current_stock' => 6, 'min_stock' => 5]);
        $noMin = $this->item(['name' => 'No minimum', 'current_stock' => 0, 'min_stock' => 0]);
        $over = $this->item(['name' => 'Toner box', 'current_stock' => 130, 'min_stock' => 5, 'max_stock' => 100, 'cost' => 2]);
        $this->movement($low, 'receive', 1, '2026-09-01 09:00:00', ['unit_cost' => 40]);
        $this->movement($low, 'receive', 1, '2026-09-03 09:00:00', ['unit_cost' => 50]);

        $body = $this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->getJson('/api/reports/tabular/stock.below_min/rows')->assertOk()->json();

        // Out of stock counts with or without a Min, like StockItem::status().
        $this->assertSame([$out->id, $noMin->id, $low->id, $over->id], array_column($body['data'], 'id'));
        [$outRow, , $lowRow, $overRow] = $body['data'];
        $this->assertSame('out', $outRow['status']);
        $this->assertEquals(5, $outRow['gap']);
        $this->assertEquals(20, $outRow['reorder_qty']);
        $this->assertNull($outRow['value']);
        $this->assertSame('low', $lowRow['status']);
        $this->assertEquals(8, $lowRow['reorder_qty']);
        $this->assertEqualsWithDelta(50.0, $lowRow['unit_cost'], 0.001);
        $this->assertEqualsWithDelta(400.0, $lowRow['value'], 0.001);
        $this->assertSame('over', $overRow['status']);
        $this->assertEquals(30, $overRow['gap']);
        $this->assertEqualsWithDelta(60.0, $overRow['value'], 0.001);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(2, $summary['out_of_stock']['value']);
        $this->assertSame(1, $summary['below_min']['value']);
        $this->assertSame(1, $summary['over_max']['value']);
        $this->assertEqualsWithDelta(400.0, $summary['reorder_value']['value'], 0.001);
        $this->assertEqualsWithDelta(60.0, $summary['excess_value']['value'], 0.001);

        $onlyOut = $this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->getJson('/api/reports/tabular/stock.below_min/rows?status=out')->assertOk()->json('data');
        $this->assertSame([$out->id, $noMin->id], array_column($onlyOut, 'id'));

        $onlyOver = $this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->getJson('/api/reports/tabular/stock.below_min/rows?status=over')->assertOk()->json('data');
        $this->assertSame([$over->id], array_column($onlyOver, 'id'));
    }

    // ── stock.valuation ─────────────────────────────────────────────────────────────

    /**
     * One SKU through September: +10 @100 (1st), −4 (10th), +5 @120 (20th), −3 (22nd),
     * a neutral transfer (23rd). Today: 8 on hand = 3 @100 + 5 @120.
     */
    private function valuedItem(): StockItem
    {
        $item = $this->item(['name' => 'SSD', 'current_stock' => 8]);
        $this->movement($item, 'receive', 10, '2026-09-01 09:00:00', ['unit_cost' => 100]);
        $this->movement($item, 'issue', 4, '2026-09-10 09:00:00');
        $this->movement($item, 'receive', 5, '2026-09-20 09:00:00', ['unit_cost' => 120]);
        $this->movement($item, 'issue', 3, '2026-09-22 09:00:00');
        $this->movement($item, 'transfer', 2, '2026-09-23 09:00:00', ['from_label' => 'Main', 'to_label' => 'Branch']);
        $this->lot($item, 10, 3, 100, '2026-09-01 09:00:00');
        $this->lot($item, 5, 5, 120, '2026-09-20 09:00:00');

        return $item;
    }

    public function test_valuation_today_matches_the_open_fifo_lots(): void
    {
        $item = $this->valuedItem();
        $this->item(['name' => 'Empty', 'current_stock' => 0]);

        $body = $this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->getJson('/api/reports/tabular/stock.valuation/rows')->assertOk()->json();

        $this->assertSame([$item->id], array_column($body['data'], 'id'));
        $row = $body['data'][0];
        $this->assertEquals(8, $row['qty_on_hand']);
        $this->assertEqualsWithDelta($item->fresh()->stockValue(), $row['stock_value'], 0.001);
        $this->assertEqualsWithDelta(900.0, $row['stock_value'], 0.001);
        $this->assertEqualsWithDelta(112.5, $row['avg_cost'], 0.001);

        $summary = collect($body['summary'])->keyBy('key');
        $this->assertSame(1, $summary['total']['value']);
        $this->assertSame(8, $summary['qty_total']['value']);
        $this->assertEqualsWithDelta(900.0, $summary['stock_value']['value'], 0.001);
    }

    public function test_valuation_rebuilds_a_past_day_from_the_ledger(): void
    {
        $this->valuedItem();
        $user = $this->userWith([...$this->reportRights('stock')]);
        $rowAt = fn (string $day) => $this->actingAs($user)->getJson("/api/reports/tabular/stock.valuation/rows?as_of={$day}")->assertOk()->json('data.0');

        // 15th: 6 left of the first lot.
        $mid = $rowAt('2026-09-15');
        $this->assertEquals(6, $mid['qty_on_hand']);
        $this->assertEqualsWithDelta(600.0, $mid['stock_value'], 0.001);

        // 21st: 5 @120 (newest) + 6 @100.
        $after = $rowAt('2026-09-21');
        $this->assertEquals(11, $after['qty_on_hand']);
        $this->assertEqualsWithDelta(1200.0, $after['stock_value'], 0.001);

        // Before anything arrived there is nothing to value.
        $this->assertNull($rowAt('2026-08-31'));
    }

    public function test_valuation_values_stock_without_lots_at_the_item_cost(): void
    {
        $this->item(['name' => 'Legacy', 'current_stock' => 4, 'cost' => 25]);

        $row = $this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->getJson('/api/reports/tabular/stock.valuation/rows?as_of=2026-09-01')->assertOk()->json('data.0');

        $this->assertEquals(4, $row['qty_on_hand']);
        $this->assertEqualsWithDelta(100.0, $row['stock_value'], 0.001);
    }

    public function test_card_sort_and_dead_stock_days_are_view_filters_kept_in_the_url(): void
    {
        $user = $this->userWith($this->reportRights('stock'));
        $view = fn (string $key) => collect($this->actingAs($user)->getJson("/api/reports/tabular/{$key}")->assertOk()->json('data.filters'))
            ->where('view', true)->mapWithKeys(fn (array $f) => [$f['name'] => [$f['default'], array_column($f['options'], 'value')]])->all();

        $this->assertEquals([
            'people_by' => ['value', ['value', 'qty', 'times']],
            'dept_by' => ['value', ['value', 'qty', 'times']],
        ], $view('stock.movements'));
        $this->assertEquals(['dead_days' => [90, [90, 180, 365]]], $view('stock.valuation'));

        $this->actingAs($user)->getJson('/api/reports/tabular/stock.movements/rows?people_by=nope')->assertUnprocessable();
        $this->actingAs($user)->getJson('/api/reports/tabular/stock.valuation/rows?dead_days=180')->assertOk();
    }

    // ── exports ─────────────────────────────────────────────────────────────────────

    public function test_xlsx_export_carries_thai_movement_labels(): void
    {
        Excel::fake();
        $this->movement($this->item(), 'receive', 1, '2026-09-02 09:00:00', ['unit_cost' => 10]);

        $this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->exportReport('/api/reports/tabular/stock.movements/export?format=xlsx')->assertAccepted();

        $this->assertExportStored('Report_stock-movements_2026-09-25.xlsx', function (TabularReportExport $export) {
            $sheet = collect($export->sheets())->first(fn (object $s) => $s instanceof TabularRowsSheet);

            return in_array('เลขที่เอกสาร', $sheet->headings(), true)
                && in_array('รับเข้า', $sheet->map($export->rows->first()), true);
        });
    }

    public function test_pdf_exports_stream_a_pdf(): void
    {
        $this->valuedItem();
        $user = $this->userWith([...$this->reportRights('stock')]);

        foreach (['stock.movements', 'stock.below_min', 'stock.valuation'] as $key) {
            $response = $this->actingAs($user)->exportReport("/api/reports/tabular/{$key}/export?format=pdf");
            $response->assertOk();
            $this->assertSame('application/pdf', $response->headers->get('Content-Type'), $key);
        }
    }
}
