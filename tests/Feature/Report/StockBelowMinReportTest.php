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
use App\Models\User;
use App\Services\Report\Stock\StockBelowMinReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * "ต่ำกว่าขั้นต่ำและเกินขั้นสูง" (stock.below_min): out, low and over-max rows in status order, the unit price
 * basis, the breakdown tiles and categories, the status filter and the by-category export sheet.
 */
class StockBelowMinReportTest extends TestCase
{
    use ExportsReports, RefreshDatabase;
    use GrantsReports;

    private int $docSeq = 0;

    /** @var array<string, StockItem> */
    private array $items = [];

    /** @var array<string, Category> */
    private array $categories = [];

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

    private function item(string $name, Category $category, int $stock, int $min, int $max, float $cost = 0, ?string $lastMove = '2026-09-20'): StockItem
    {
        $unit = Unit::firstOrCreate(['name' => 'pcs']);

        return $this->items[$name] = StockItem::create([
            'sku' => 'SKU-'.str_pad((string) (StockItem::count() + 1), 7, '0', STR_PAD_LEFT),
            'name' => $name, 'category_id' => $category->id, 'unit_id' => $unit->id, 'cost' => $cost,
            'current_stock' => $stock, 'min_stock' => $min, 'max_stock' => $max, 'last_move_at' => $lastMove,
        ]);
    }

    private function receipt(StockItem $item, int $qty, float $cost, string $movedAt): void
    {
        StockMovement::create([
            'doc_no' => 'DOC-'.(++$this->docSeq), 'type' => 'receive', 'stock_item_id' => $item->id,
            'qty' => $qty, 'unit_cost' => $cost, 'moved_at' => $movedAt, 'recorded_by' => 'IT Staff',
        ]);
    }

    private function lot(StockItem $item, int $remaining, float $cost): void
    {
        StockLot::create([
            'stock_item_id' => $item->id, 'unit_cost' => $cost,
            'qty_received' => $remaining, 'qty_remaining' => $remaining, 'received_at' => '2026-09-01 09:00:00',
        ]);
    }

    /**
     * Parts: Toner out (min 5, no price), Mouse low 2/5 (last receipt 50), Cable ok, SSD over 30/20 (lots avg 120),
     * Dead ok but idle. Cables: Ink out with no min (cost 15), Keyboard low 1/10 with max 0 (cost 20),
     * HDD over 12/10 (last receipt 80, no lots), Fan over 15/5 with no price. Created out of order on purpose.
     */
    private function seedStock(): void
    {
        $parts = $this->categories['parts'] = Category::create(['name' => 'Spare parts', 'name_th' => 'อะไหล่']);
        $cables = $this->categories['cables'] = Category::create(['name' => 'Cables', 'name_th' => 'สาย']);

        $this->item('Ink', $cables, 0, 0, 10, 15);
        $this->item('Toner', $parts, 0, 5, 20);
        $mouse = $this->item('Mouse', $parts, 2, 5, 10, 30);
        $this->receipt($mouse, 1, 40, '2026-09-01 09:00:00');
        $this->receipt($mouse, 1, 50, '2026-09-03 09:00:00');
        $this->item('Keyboard', $cables, 1, 10, 0, 20);
        $this->item('Cable', $parts, 6, 5, 100, 10);
        $hdd = $this->item('HDD', $cables, 12, 0, 10, 60);
        $this->receipt($hdd, 12, 80, '2026-08-01 09:00:00');
        $ssd = $this->item('SSD', $parts, 30, 5, 20, 90);
        $this->receipt($ssd, 20, 130, '2026-09-01 09:00:00');
        $this->lot($ssd, 10, 100);
        $this->lot($ssd, 20, 130);
        $this->item('Fan', $cables, 15, 0, 5);
        $this->item('Dead', $parts, 5, 0, 10, 10, '2026-01-01');
    }

    /** @return array<string, mixed> */
    private function rows(string $query = ''): array
    {
        return $this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->getJson('/api/reports/tabular/stock.below_min/rows'.($query === '' ? '' : '?'.$query))
            ->assertOk()->json();
    }

    /** @return array<string, mixed> */
    private function breakdown(string $query = ''): array
    {
        return $this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->getJson('/api/reports/stock/below-min/breakdown'.($query === '' ? '' : '?'.$query))
            ->assertOk()->json('data');
    }

    /** @param list<array<string, mixed>> $rows */
    private function names(array $rows): array
    {
        $byId = collect($this->items)->mapWithKeys(fn (StockItem $i) => [$i->id => $i->name]);

        return array_map(fn (array $row) => $byId[$row['id']], $rows);
    }

    // ── rows ────────────────────────────────────────────────────────────────────────

    public function test_rows_are_out_then_low_by_shortfall_ratio_then_over_by_excess_value(): void
    {
        $this->seedStock();

        $rows = $this->rows()['data'];

        $this->assertSame(['Toner', 'Ink', 'Keyboard', 'Mouse', 'SSD', 'HDD', 'Fan'], $this->names($rows));
        $this->assertSame(['out', 'out', 'low', 'low', 'over', 'over', 'over'], array_column($rows, 'status'));
    }

    public function test_out_and_low_rows_carry_shortfall_reorder_and_price_basis(): void
    {
        $this->seedStock();

        $rows = collect($this->rows()['data'])->keyBy(fn (array $r) => $this->names([$r])[0]);

        $toner = $rows['Toner'];
        $this->assertEquals(5, $toner['gap']);
        $this->assertEquals(20, $toner['reorder_qty']);
        $this->assertNull($toner['unit_cost']);
        $this->assertSame('none', $toner['unit_cost_basis']);
        $this->assertNull($toner['value']);
        $this->assertSame('reorder', $toner['value_kind']);

        $ink = $rows['Ink'];
        $this->assertEquals(0, $ink['gap']);
        $this->assertEquals(10, $ink['reorder_qty']);
        $this->assertEqualsWithDelta(15.0, $ink['unit_cost'], 0.001);
        $this->assertSame('item_cost', $ink['unit_cost_basis']);
        $this->assertEqualsWithDelta(150.0, $ink['value'], 0.001);

        $mouse = $rows['Mouse'];
        $this->assertEquals(3, $mouse['gap']);
        $this->assertEquals(8, $mouse['reorder_qty']);
        $this->assertEqualsWithDelta(50.0, $mouse['unit_cost'], 0.001);
        $this->assertSame('last_receipt', $mouse['unit_cost_basis']);
        $this->assertEqualsWithDelta(400.0, $mouse['value'], 0.001);
        $this->assertEquals(5, $mouse['min_stock']);
        $this->assertEquals(10, $mouse['max_stock']);
        $this->assertEquals(2, $mouse['qty_on_hand']);
        $this->assertSame('2026-09-20', $mouse['last_move']);

        // Low before over even when also above a max set below min; reorder fills to min then.
        $keyboard = $rows['Keyboard'];
        $this->assertSame('low', $keyboard['status']);
        $this->assertEquals(9, $keyboard['gap']);
        $this->assertEquals(9, $keyboard['reorder_qty']);
        $this->assertEqualsWithDelta(180.0, $keyboard['value'], 0.001);
    }

    public function test_on_hand_follows_the_level_bar_and_unit_follows_the_gap(): void
    {
        $this->seedStock();
        // Min and Max are hidden helper columns; the page order is what the reader sees
        $keys = array_values(array_diff(array_column(app(StockBelowMinReport::class)->definition()['columns'], 'key'), ['min_stock', 'max_stock']));
        $at = array_search('status', $keys, true);

        $this->assertSame(['status', 'level', 'qty_on_hand', 'gap', 'unit'], array_slice($keys, $at, 5));
        $this->assertNotContains('unit', array_slice($keys, 0, $at));

        $mouse = collect($this->rows()['data'])->firstWhere('item_name', 'Mouse');
        $this->assertSame('5 – 10', $mouse['level']);
        $this->assertEquals(2, $mouse['qty_on_hand']);
    }

    public function test_over_rows_carry_excess_at_the_average_cost(): void
    {
        $this->seedStock();

        $rows = collect($this->rows()['data'])->keyBy(fn (array $r) => $this->names([$r])[0]);

        $ssd = $rows['SSD'];
        $this->assertEquals(10, $ssd['gap']);
        $this->assertEquals(0, $ssd['reorder_qty']);
        $this->assertEqualsWithDelta(120.0, $ssd['unit_cost'], 0.001);
        $this->assertSame('average', $ssd['unit_cost_basis']);
        $this->assertEqualsWithDelta(1200.0, $ssd['value'], 0.001);
        $this->assertSame('excess', $ssd['value_kind']);

        // No open lots: the unit price stands in.
        $hdd = $rows['HDD'];
        $this->assertEquals(2, $hdd['gap']);
        $this->assertEqualsWithDelta(80.0, $hdd['unit_cost'], 0.001);
        $this->assertSame('last_receipt', $hdd['unit_cost_basis']);
        $this->assertEqualsWithDelta(160.0, $hdd['value'], 0.001);

        $fan = $rows['Fan'];
        $this->assertEquals(10, $fan['gap']);
        $this->assertNull($fan['unit_cost']);
        $this->assertSame('none', $fan['unit_cost_basis']);
        $this->assertNull($fan['value']);
    }

    public function test_the_status_filter_takes_out_low_or_over(): void
    {
        $this->seedStock();

        $this->assertSame(['Toner', 'Ink'], $this->names($this->rows('status=out')['data']));
        $this->assertSame(['Keyboard', 'Mouse'], $this->names($this->rows('status=low')['data']));
        $this->assertSame(['SSD', 'HDD', 'Fan'], $this->names($this->rows('status=over')['data']));
    }

    public function test_category_and_search_narrow_the_rows(): void
    {
        $this->seedStock();

        $this->assertSame(['Toner', 'Mouse', 'SSD'], $this->names($this->rows('category_id='.$this->categories['parts']->id)['data']));
        $this->assertSame(['SSD'], $this->names($this->rows('search=ssd')['data']));
    }

    public function test_summary_tiles_count_out_low_over_and_both_values(): void
    {
        $this->seedStock();

        $summary = collect($this->rows()['summary'])->keyBy('key');

        $this->assertSame(['out_of_stock', 'below_min', 'over_max', 'reorder_value', 'excess_value'], $summary->keys()->all());
        $this->assertSame(2, $summary['out_of_stock']['value']);
        $this->assertSame(2, $summary['below_min']['value']);
        $this->assertSame(3, $summary['over_max']['value']);
        $this->assertEqualsWithDelta(730.0, $summary['reorder_value']['value'], 0.001);
        $this->assertEqualsWithDelta(1360.0, $summary['excess_value']['value'], 0.001);
    }

    // ── breakdown ───────────────────────────────────────────────────────────────────

    public function test_breakdown_tiles_and_categories(): void
    {
        $this->seedStock();

        $data = $this->breakdown();

        $this->assertSame(['tiles', 'categories'], array_keys($data));
        $tiles = $data['tiles'];
        $this->assertSame(9, $tiles['items_total']);
        $this->assertSame(2, $tiles['out']);
        $this->assertSame(2, $tiles['low']);
        $this->assertSame(3, $tiles['over']);
        $this->assertSame(12, $tiles['low_gap']);
        $this->assertSame(22, $tiles['over_excess']);
        $this->assertEqualsWithDelta(730.0, $tiles['reorder']['value'], 0.001);
        $this->assertSame(4, $tiles['reorder']['items']);
        $this->assertEqualsWithDelta(1360.0, $tiles['excess_value'], 0.001);

        $this->assertSame([
            ['category_id' => $this->categories['cables']->id, 'name' => 'Cables', 'name_th' => 'สาย', 'out' => 1, 'low' => 1, 'over' => 2],
            ['category_id' => $this->categories['parts']->id, 'name' => 'Spare parts', 'name_th' => 'อะไหล่', 'out' => 1, 'low' => 1, 'over' => 1],
        ], $data['categories']);
    }

    public function test_the_category_filter_narrows_the_breakdown_but_status_and_search_do_not(): void
    {
        $this->seedStock();

        $parts = $this->breakdown('category_id='.$this->categories['parts']->id);
        $this->assertSame(5, $parts['tiles']['items_total']);
        $this->assertSame([1, 1, 1], [$parts['tiles']['out'], $parts['tiles']['low'], $parts['tiles']['over']]);
        $this->assertEqualsWithDelta(400.0, $parts['tiles']['reorder']['value'], 0.001);
        $this->assertSame(2, $parts['tiles']['reorder']['items']);
        $this->assertEqualsWithDelta(1200.0, $parts['tiles']['excess_value'], 0.001);
        $this->assertCount(1, $parts['categories']);

        $this->assertSame($this->breakdown()['tiles'], $this->breakdown('status=over&search=ssd')['tiles']);
    }

    public function test_an_empty_stock_gives_zeros(): void
    {
        $data = $this->breakdown();

        $this->assertSame(0, $data['tiles']['items_total']);
        $this->assertSame(0, $data['tiles']['over']);
        $this->assertEquals(0, $data['tiles']['reorder']['value']);
        $this->assertEquals(0, $data['tiles']['excess_value']);
        $this->assertSame([], $data['categories']);
    }

    public function test_bad_filters_are_refused_and_the_stock_report_switch_is_needed(): void
    {
        $user = $this->userWith([...$this->reportRights('stock')]);
        $this->actingAs($user)->getJson('/api/reports/stock/below-min/breakdown?status=dead')->assertUnprocessable();
        $this->actingAs($user)->getJson('/api/reports/tabular/stock.below_min/rows?status=dead')->assertUnprocessable();

        $this->actingAs($this->userWith(['stock.module', 'stock.view', 'stock.view_events', ...$this->reportRights('assets')]))
            ->getJson('/api/reports/stock/below-min/breakdown')->assertForbidden();
    }

    // ── export ──────────────────────────────────────────────────────────────────────

    public function test_export_sections_carry_the_categories(): void
    {
        $this->seedStock();
        $report = new StockBelowMinReport;

        $sections = $report->exportSections($this->userWith([...$this->reportRights('stock')]), $report->resolveFilters([]));

        $this->assertSame(['ตามหมวด'], array_column($sections, 'title'));
        $this->assertSame(['หมวด', 'หมดสต็อก', 'ต่ำกว่า Min', 'เกิน Max', 'รวม'], $sections[0]['headings']);
        $this->assertSame([['สาย', 1, 1, 2, 4], ['อะไหล่', 1, 1, 1, 3]], $sections[0]['rows']);
    }

    public function test_xlsx_export_carries_the_category_sheet_and_thai_status_words(): void
    {
        Excel::fake();
        $this->seedStock();

        $this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->exportReport('/api/reports/tabular/stock.below_min/export?format=xlsx')->assertAccepted();

        $this->assertExportStored('Report_stock-below_min_2026-09-25.xlsx', function (TabularReportExport $export) {
            $rows = collect($export->sheets())->first(fn (object $s) => $s instanceof TabularRowsSheet);
            $statuses = $export->rows->map(fn ($row) => $rows->map($row))->pluck(array_search('สถานะ', $rows->headings(), true))->all();

            return array_column($export->sections, 'title') === ['ตามหมวด']
                && in_array('ที่มาของราคา', $rows->headings(), true)
                && $statuses === ['หมดสต็อก', 'หมดสต็อก', 'ต่ำกว่า Min', 'ต่ำกว่า Min', 'เกิน Max', 'เกิน Max', 'เกิน Max'];
        });
    }
}
