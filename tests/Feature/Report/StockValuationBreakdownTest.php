<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Exports\Report\TabularRowsSheet;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Category;
use App\Models\Settings\Unit;
use App\Models\Stock\StockBalance;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Report\Stock\StockValuationReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * "มูลค่าคงคลัง" (stock.valuation) breakdown: tiles, value by category and by warehouse, dead stock at the day,
 * parity with the rows' qtyAt/valueAt, the last-move column, value-descending rows and the export sheets.
 */
class StockValuationBreakdownTest extends TestCase
{
    use ExportsReports, RefreshDatabase;
    use GrantsReports;

    private int $docSeq = 0;

    /** @var array<string, mixed> */
    private array $s = [];

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
    private function item(string $name, Category $category, int $stock, float $cost, ?string $lastMove, array $attributes = []): StockItem
    {
        $unit = Unit::firstOrCreate(['name' => 'pcs']);

        return StockItem::create(array_merge([
            'sku' => 'SKU-'.str_pad((string) (StockItem::count() + 1), 7, '0', STR_PAD_LEFT),
            'name' => $name, 'category_id' => $category->id, 'unit_id' => $unit->id, 'cost' => $cost,
            'current_stock' => $stock, 'min_stock' => 0, 'max_stock' => 100, 'last_move_at' => $lastMove,
        ], $attributes));
    }

    /** @param array<string, mixed> $attributes */
    private function movement(StockItem $item, string $type, int $qty, string $movedAt, array $attributes = []): void
    {
        StockMovement::create(array_merge([
            'doc_no' => 'DOC-'.(++$this->docSeq), 'type' => $type, 'stock_item_id' => $item->id,
            'qty' => $qty, 'moved_at' => $movedAt, 'recorded_by' => 'IT Staff',
        ], $attributes));
    }

    private function lot(StockItem $item, int $received, int $remaining, float $cost, string $receivedAt): void
    {
        StockLot::create([
            'stock_item_id' => $item->id, 'unit_cost' => $cost,
            'qty_received' => $received, 'qty_remaining' => $remaining, 'received_at' => $receivedAt,
        ]);
    }

    private function balance(StockItem $item, Warehouse $warehouse, int $qty): void
    {
        StockBalance::create(['stock_item_id' => $item->id, 'warehouse_id' => $warehouse->id, 'qty' => $qty]);
    }

    /**
     * Today (25 Sep): SSD 8 = 3 @100 + 5 @120 (900; Main 6, Branch 2), HDD 2 @80 untouched since 1 Mar (160; Main),
     * Cable 5 @30 untouched since 1 Jun 2025 (150; Branch), Mouse out since 24 Sep, Legacy 4 with no lots or moves.
     */
    private function seedStock(): void
    {
        $parts = Category::create(['name' => 'Spare parts', 'name_th' => 'อะไหล่']);
        $cables = Category::create(['name' => 'Cables', 'name_th' => 'สาย']);
        $main = Warehouse::create(['name' => 'Main']);
        $branch = Warehouse::create(['name' => 'Branch']);

        $ssd = $this->item('SSD 1TB', $parts, 8, 50, '2026-09-22');
        $this->movement($ssd, 'receive', 10, '2026-09-01 09:00:00', ['unit_cost' => 100]);
        $this->movement($ssd, 'issue', 4, '2026-09-10 09:00:00');
        $this->movement($ssd, 'receive', 5, '2026-09-20 09:00:00', ['unit_cost' => 120]);
        $this->movement($ssd, 'issue', 3, '2026-09-22 09:00:00');
        $this->lot($ssd, 10, 3, 100, '2026-09-01 09:00:00');
        $this->lot($ssd, 5, 5, 120, '2026-09-20 09:00:00');
        $this->balance($ssd, $main, 6);
        $this->balance($ssd, $branch, 2);

        $hdd = $this->item('HDD 2TB', $parts, 2, 50, '2026-03-01');
        $this->movement($hdd, 'receive', 2, '2026-03-01 09:00:00', ['unit_cost' => 80]);
        $this->lot($hdd, 2, 2, 80, '2026-03-01 09:00:00');
        $this->balance($hdd, $main, 2);

        $cable = $this->item('LAN cable', $cables, 5, 30, '2025-06-01');
        $this->movement($cable, 'receive', 5, '2025-06-01 09:00:00', ['unit_cost' => 30]);
        $this->lot($cable, 5, 5, 30, '2025-06-01 09:00:00');
        $this->balance($cable, $branch, 5);

        $mouse = $this->item('Mouse', $cables, 0, 10, '2026-09-24');
        $this->movement($mouse, 'receive', 3, '2026-01-10 09:00:00', ['unit_cost' => 10]);
        $this->movement($mouse, 'issue', 3, '2026-09-24 09:00:00');
        $this->lot($mouse, 3, 0, 10, '2026-01-10 09:00:00');

        $legacy = $this->item('Legacy part', $cables, 4, 25, null);

        $this->s = compact('parts', 'cables', 'main', 'branch', 'ssd', 'hdd', 'cable', 'mouse', 'legacy');
    }

    /** @return array<string, mixed> */
    private function breakdown(string $query = ''): array
    {
        return $this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->getJson('/api/reports/stock/valuation/breakdown'.($query === '' ? '' : '?'.$query))
            ->assertOk()->json('data');
    }

    // ── today ───────────────────────────────────────────────────────────────────────

    public function test_unit_is_its_own_column_after_the_quantity(): void
    {
        $keys = array_column(app(StockValuationReport::class)->definition()['columns'], 'key');
        $at = array_search('qty_on_hand', $keys, true);

        $this->assertSame(['qty_on_hand', 'unit'], array_slice($keys, $at, 2));
        $this->assertNotContains('unit', array_slice($keys, 0, $at));
    }

    public function test_tiles_today_count_held_out_and_dead_stock(): void
    {
        $this->seedStock();

        $data = $this->breakdown();

        $this->assertSame('2026-09-25', $data['as_of']);
        $this->assertTrue($data['today']);
        $tiles = $data['tiles'];
        $this->assertEqualsWithDelta(1210.0, $tiles['value'], 0.001);
        $this->assertSame(19, $tiles['qty']);
        $this->assertSame(4, $tiles['held']);
        $this->assertSame(5, $tiles['items']);
        $this->assertSame(1, $tiles['out']);
        $this->assertEqualsWithDelta(310.0, $tiles['dead90']['value'], 0.001);
        $this->assertSame(2, $tiles['dead90']['count']);
    }

    public function test_categories_list_held_items_by_value(): void
    {
        $this->seedStock();

        $categories = $this->breakdown()['categories'];

        $this->assertSame([$this->s['parts']->id, $this->s['cables']->id], array_column($categories, 'category_id'));
        $this->assertSame(['name' => 'Spare parts', 'name_th' => 'อะไหล่', 'items' => 2, 'qty' => 10], array_intersect_key($categories[0], array_flip(['name', 'name_th', 'items', 'qty'])));
        $this->assertEqualsWithDelta(1060.0, $categories[0]['value'], 0.001);
        $this->assertSame(2, $categories[1]['items']);
        $this->assertSame(9, $categories[1]['qty']);
        $this->assertEqualsWithDelta(150.0, $categories[1]['value'], 0.001);
    }

    public function test_warehouses_today_value_balances_at_the_item_unit_value(): void
    {
        $this->seedStock();

        $warehouses = $this->breakdown()['warehouses'];

        $this->assertSame(['Main', 'Branch'], array_column($warehouses, 'name'));
        $this->assertSame($this->s['main']->id, $warehouses[0]['warehouse_id']);
        // Main: SSD 6 × 112.5 + HDD 2 × 80; Branch: SSD 2 × 112.5 + Cable 5 × 30.
        $this->assertSame([2, 8], [$warehouses[0]['items'], $warehouses[0]['qty']]);
        $this->assertEqualsWithDelta(835.0, $warehouses[0]['value'], 0.001);
        $this->assertSame([2, 7], [$warehouses[1]['items'], $warehouses[1]['qty']]);
        $this->assertEqualsWithDelta(375.0, $warehouses[1]['value'], 0.001);
    }

    public function test_dead_list_today_uses_the_items_last_move_and_skips_never_moved_items(): void
    {
        $this->seedStock();

        $dead = $this->breakdown()['dead'];

        $this->assertSame([$this->s['hdd']->id, $this->s['cable']->id], array_column($dead, 'item_id'));
        $this->assertSame([
            'item_id' => $this->s['hdd']->id, 'sku' => $this->s['hdd']->sku, 'name' => 'HDD 2TB',
            'category' => 'Spare parts', 'category_th' => 'อะไหล่', 'unit' => 'pcs', 'qty' => 2,
            'last_move' => '2026-03-01', 'days' => 208,
        ], array_diff_key($dead[0], ['value' => true]));
        $this->assertEqualsWithDelta(160.0, $dead[0]['value'], 0.001);
        // Older than 365 days: still listed, the page filters 180 / 365 on these days.
        $this->assertSame(481, $dead[1]['days']);
    }

    public function test_ninety_days_is_not_yet_dead(): void
    {
        $category = Category::create(['name' => 'Parts']);
        $edge = $this->item('Edge', $category, 1, 10, '2026-06-27');
        $over = $this->item('Over', $category, 1, 10, '2026-06-26');
        $this->movement($edge, 'receive', 1, '2026-06-27 09:00:00', ['unit_cost' => 10]);
        $this->movement($over, 'receive', 1, '2026-06-26 09:00:00', ['unit_cost' => 10]);

        $dead = $this->breakdown()['dead'];

        $this->assertSame([$over->id], array_column($dead, 'item_id'));
        $this->assertSame(91, $dead[0]['days']);
    }

    // ── a past day ──────────────────────────────────────────────────────────────────

    public function test_a_past_day_rebuilds_from_the_ledger_and_has_no_warehouses(): void
    {
        $this->seedStock();

        $data = $this->breakdown('as_of=2026-09-15');

        $this->assertSame('2026-09-15', $data['as_of']);
        $this->assertFalse($data['today']);
        $this->assertNull($data['warehouses']);
        // SSD 6 @100, HDD 160, Cable 150, Mouse 3 @10, Legacy 4 at the item cost.
        $this->assertEqualsWithDelta(1040.0, $data['tiles']['value'], 0.001);
        $this->assertSame([20, 5, 5, 0], [$data['tiles']['qty'], $data['tiles']['held'], $data['tiles']['items'], $data['tiles']['out']]);
        $this->assertEqualsWithDelta(340.0, $data['tiles']['dead90']['value'], 0.001);
        $this->assertSame(3, $data['tiles']['dead90']['count']);
    }

    public function test_the_dead_list_at_a_past_day_uses_the_last_move_on_or_before_it(): void
    {
        $this->seedStock();

        $dead = $this->breakdown('as_of=2026-09-15')['dead'];

        // Mouse last moved on 10 Jan by then; its 24 Sep issue is after the day.
        $this->assertSame([$this->s['hdd']->id, $this->s['cable']->id, $this->s['mouse']->id], array_column($dead, 'item_id'));
        $this->assertSame(['2026-03-01', '2025-06-01', '2026-01-10'], array_column($dead, 'last_move'));
        $this->assertSame([198, 471, 248], array_column($dead, 'days'));
        $this->assertSame(3, $dead[2]['qty']);
        $this->assertEqualsWithDelta(30.0, $dead[2]['value'], 0.001);
    }

    public function test_breakdown_numbers_equal_the_rows_at_any_day(): void
    {
        $this->seedStock();
        $user = $this->userWith([...$this->reportRights('stock')]);

        foreach (['2026-09-25', '2026-09-21', '2026-09-15', '2026-02-01'] as $day) {
            $rows = $this->actingAs($user)->getJson("/api/reports/tabular/stock.valuation/rows?as_of={$day}&per_page=100")->assertOk()->json();
            $tiles = $this->actingAs($user)->getJson("/api/reports/stock/valuation/breakdown?as_of={$day}")->assertOk()->json('data.tiles');
            $summary = collect($rows['summary'])->keyBy('key');

            $this->assertSame($summary['total']['value'], $tiles['held'], $day);
            $this->assertSame($summary['qty_total']['value'], $tiles['qty'], $day);
            $this->assertEqualsWithDelta($summary['stock_value']['value'], $tiles['value'], 0.001, $day);
            $this->assertEqualsWithDelta(array_sum(array_column($rows['data'], 'stock_value')), $tiles['value'], 0.001, $day);
        }
    }

    // ── filters, permission, empty ──────────────────────────────────────────────────

    public function test_the_category_filter_narrows_every_card_but_search_does_not(): void
    {
        $this->seedStock();

        $data = $this->breakdown('category_id='.$this->s['parts']->id.'&search=zzz');

        $this->assertSame([2, 2, 0, 10], [$data['tiles']['items'], $data['tiles']['held'], $data['tiles']['out'], $data['tiles']['qty']]);
        $this->assertSame([$this->s['parts']->id], array_column($data['categories'], 'category_id'));
        $this->assertSame([$this->s['hdd']->id], array_column($data['dead'], 'item_id'));
        $this->assertEqualsWithDelta(835.0, $data['warehouses'][0]['value'], 0.001);
        $this->assertEqualsWithDelta(225.0, $data['warehouses'][1]['value'], 0.001);
    }

    public function test_bad_filters_are_refused_and_the_stock_report_switch_is_needed(): void
    {
        $user = $this->userWith([...$this->reportRights('stock')]);
        $this->actingAs($user)->getJson('/api/reports/stock/valuation/breakdown?as_of=25-09-2026')->assertUnprocessable();
        $this->actingAs($user)->getJson('/api/reports/stock/valuation/breakdown?category_id=999')->assertUnprocessable();

        $this->actingAs($this->userWith(['stock.module', 'stock.view', 'stock.view_events', ...$this->reportRights('assets')]))
            ->getJson('/api/reports/stock/valuation/breakdown')->assertForbidden();
    }

    public function test_an_empty_stock_gives_zeros(): void
    {
        $data = $this->breakdown();

        $this->assertEquals(['value' => 0, 'qty' => 0, 'held' => 0, 'items' => 0, 'out' => 0, 'dead90' => ['value' => 0, 'count' => 0]], $data['tiles']);
        $this->assertSame([], $data['categories']);
        $this->assertSame([], $data['warehouses']);
        $this->assertSame([], $data['dead']);
    }

    // ── rows ────────────────────────────────────────────────────────────────────────

    public function test_rows_are_held_items_by_value_with_the_last_move_at_the_day(): void
    {
        $this->seedStock();
        $user = $this->userWith([...$this->reportRights('stock')]);

        $past = $this->actingAs($user)->getJson('/api/reports/tabular/stock.valuation/rows?as_of=2026-09-15')->assertOk()->json('data');
        $this->assertSame(
            [$this->s['ssd']->id, $this->s['hdd']->id, $this->s['cable']->id, $this->s['legacy']->id, $this->s['mouse']->id],
            array_column($past, 'id'),
        );
        $this->assertSame(['2026-09-10', '2026-03-01', '2025-06-01', null, '2026-01-10'], array_column($past, 'last_move'));

        $today = $this->actingAs($user)->getJson('/api/reports/tabular/stock.valuation/rows')->assertOk()->json('data');
        $this->assertSame([$this->s['ssd']->id, $this->s['hdd']->id, $this->s['cable']->id, $this->s['legacy']->id], array_column($today, 'id'));
        $this->assertSame('2026-09-22', $today[0]['last_move']);
    }

    // ── export ──────────────────────────────────────────────────────────────────────

    public function test_export_sections_carry_categories_warehouses_today_only_and_dead_stock(): void
    {
        $this->seedStock();
        $report = new StockValuationReport;
        $user = $this->userWith([...$this->reportRights('stock')]);

        $today = collect($report->exportSections($user, $report->resolveFilters([])))->keyBy('title');
        $this->assertSame(['มูลค่าตามหมวด', 'มูลค่าตามคลัง', 'รายการที่ไม่เคลื่อนไหวเกิน 90 วัน'], $today->keys()->all());
        $this->assertSame(['อะไหล่', 'สาย'], array_column($today['มูลค่าตามหมวด']['rows'], 0));
        $this->assertSame(['Main', 'Branch'], array_column($today['มูลค่าตามคลัง']['rows'], 0));
        $this->assertSame([87.6, 12.4], array_column($today['มูลค่าตามหมวด']['rows'], 4));
        $this->assertSame(['HDD 2TB', 'LAN cable'], array_column($today['รายการที่ไม่เคลื่อนไหวเกิน 90 วัน']['rows'], 1));

        $past = array_column((new StockValuationReport)->exportSections($user, $report->resolveFilters(['as_of' => '2026-09-15'])), 'title');
        $this->assertSame(['มูลค่าตามหมวด', 'รายการที่ไม่เคลื่อนไหวเกิน 90 วัน'], $past);

        // HDD off the shelves: the warehouse share is of the warehouses' 1,050, not the 1,210 in the tile.
        StockBalance::query()->where('stock_item_id', $this->s['hdd']->id)->delete();
        $shelved = collect((new StockValuationReport)->exportSections($user, $report->resolveFilters([])))->keyBy('title');
        $this->assertSame([64.3, 35.7], array_column($shelved['มูลค่าตามคลัง']['rows'], 4));
    }

    public function test_xlsx_export_carries_the_section_sheets_and_the_last_move_column(): void
    {
        Excel::fake();
        $this->seedStock();

        $this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->exportReport('/api/reports/tabular/stock.valuation/export?format=xlsx')->assertAccepted();

        $this->assertExportStored('Report_stock-valuation_2026-09-25.xlsx', function (TabularReportExport $export) {
            $rows = collect($export->sheets())->first(fn (object $s) => $s instanceof TabularRowsSheet);

            return array_column($export->sections, 'title') === ['มูลค่าตามหมวด', 'มูลค่าตามคลัง', 'รายการที่ไม่เคลื่อนไหวเกิน 90 วัน']
                && $rows !== null
                && in_array('เคลื่อนไหวล่าสุด', $rows->headings(), true);
        });
    }
}
