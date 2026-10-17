<?php

namespace Tests\Feature\Report;

use App\Exports\Report\TabularReportExport;
use App\Exports\Report\TabularRowsSheet;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Settings\Category;
use App\Models\Settings\Unit;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockCountLine;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Report\Stock\StockCostBook;
use App\Services\Report\Stock\StockMovementReport;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\Concerns\ExportsReports;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

/**
 * "รับเข้าและเบิกจ่าย" (stock.movements) breakdown: tiles, monthly flow, pending requests, top requesters and
 * departments, count variance, card gating, the lot-cost value rule, the 12-month default range and the export sheets.
 */
class StockMovementsBreakdownTest extends TestCase
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
    private function userWith(array $permissions, array $attributes = []): User
    {
        $role = Role::create(['key' => 'rep_'.uniqid(), 'name' => 'Report Test', 'is_system' => false]);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }

        return User::factory()->create(['role' => $role->key, ...$attributes]);
    }

    /** @param array<string, mixed> $attributes */
    private function item(string $name, Category $category, float $cost, array $attributes = []): StockItem
    {
        $unit = Unit::firstOrCreate(['name' => 'pcs']);

        return StockItem::create(array_merge([
            'sku' => 'SKU-'.str_pad((string) (StockItem::count() + 1), 7, '0', STR_PAD_LEFT),
            'name' => $name, 'category_id' => $category->id, 'unit_id' => $unit->id, 'cost' => $cost,
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

    private function lot(StockItem $item, int $qty, float $cost, string $receivedAt): StockLot
    {
        return StockLot::create([
            'stock_item_id' => $item->id, 'unit_cost' => $cost,
            'qty_received' => $qty, 'qty_remaining' => $qty, 'received_at' => $receivedAt,
        ]);
    }

    /** @param array<string, mixed> $attributes */
    private function request(StockItem $item, User $user, int $qty, string $status, string $createdAt, array $attributes = []): StockRequest
    {
        $request = StockRequest::create(array_merge([
            'stock_item_id' => $item->id, 'user_id' => $user->id, 'requester_name' => $user->name,
            'qty' => $qty, 'reason' => 'Need', 'status' => $status,
        ], $attributes));
        $request->created_at = $createdAt;
        $request->save();

        return $request;
    }

    /** @param list<array{0: StockItem, 1: int, 2: ?int}> $lines  item, system, counted */
    private function stockCount(string $reference, ?string $warehouse, string $status, ?string $committedAt, array $lines): StockCount
    {
        $count = StockCount::create(['reference' => $reference, 'warehouse' => $warehouse, 'status' => $status, 'committed_at' => $committedAt]);
        foreach ($lines as [$item, $system, $counted]) {
            StockCountLine::create(['stock_count_id' => $count->id, 'stock_item_id' => $item->id, 'system_qty' => $system, 'counted_qty' => $counted]);
        }

        return $count;
    }

    /**
     * SSD (spare parts, lots 10 @100 on 1 Sep and 10 @200 on 20 Sep), Cable (cables, item cost 30, no lots) and
     * Mouse (cables, item cost 10). Two warehouses, three requesters, four counts.
     */
    private function seedStock(): void
    {
        $parts = Category::create(['name' => 'Spare parts', 'name_th' => 'อะไหล่']);
        $cables = Category::create(['name' => 'Cables', 'name_th' => 'สาย']);
        $main = Warehouse::create(['name' => 'Main']);
        $branch = Warehouse::create(['name' => 'Branch']);
        $ssd = $this->item('SSD 1TB', $parts, 50);
        $cable = $this->item('LAN cable', $cables, 30);
        $mouse = $this->item('Mouse', $cables, 10);
        $this->lot($ssd, 10, 100, '2026-09-01 09:00:00');
        $this->lot($ssd, 10, 200, '2026-09-20 09:00:00');

        $this->movement($ssd, 'receive', 5, '2025-09-15 09:00:00', ['unit_cost' => 90, 'to_label' => 'Main']);
        $this->movement($ssd, 'receive', 10, '2026-09-01 09:00:00', ['unit_cost' => 100, 'to_label' => 'Main']);
        $this->movement($ssd, 'issue', 4, '2026-09-10 09:00:00', ['from_label' => 'Main', 'to_label' => 'Somchai']);
        $this->movement($ssd, 'adjust_up', 2, '2026-09-15 09:00:00', ['to_label' => 'Main']);
        $this->movement($ssd, 'receive', 10, '2026-09-20 09:00:00', ['unit_cost' => 200, 'to_label' => 'Main']);
        $this->movement($ssd, 'adjust_down', 1, '2026-09-21 09:00:00', ['from_label' => 'Main']);
        $this->movement($ssd, 'issue', 2, '2026-09-22 09:00:00', ['from_label' => 'Main', 'to_label' => 'Suda']);
        $this->movement($ssd, 'return', 1, '2026-09-23 09:00:00', ['from_label' => 'Suda', 'to_label' => 'Main']);
        $this->movement($ssd, 'transfer', 3, '2026-09-24 09:00:00', ['from_label' => 'Main', 'to_label' => 'Branch']);
        // Before any lot arrived: valued at the oldest lot's cost.
        $this->movement($ssd, 'issue', 1, '2026-08-20 09:00:00', ['from_label' => 'Main', 'to_label' => 'Somchai']);
        $this->movement($cable, 'issue', 5, '2026-07-05 09:00:00', ['from_label' => 'Branch', 'to_label' => 'Suda']);

        $it = Department::create(['name' => 'Information Technology', 'name_th' => 'ไอที', 'tag' => 'IT']);
        $hr = Department::create(['name' => 'Human Resources', 'name_th' => 'บุคคล', 'tag' => 'HR']);
        $employee = fn (string $code, Department $d, array $thai = []) => Employee::create([
            'code' => $code, 'first_name' => $code, 'last_name' => 'Test', 'department_id' => $d->id, 'status' => 'active', ...$thai,
        ]);
        $somchai = $this->userWith([], ['name' => 'Somchai', 'employee_id' => $employee('EMP-1', $it, ['first_name_th' => 'สมชาย', 'last_name_th' => 'ใจดี'])->id]);
        $suda = $this->userWith([], ['name' => 'Suda', 'employee_id' => $employee('EMP-2', $hr)->id]);
        $nobody = $this->userWith([], ['name' => 'Nobody']);

        $this->request($ssd, $somchai, 2, 'fulfilled', '2026-09-09 09:00:00', ['fulfilled_at' => '2026-09-10 09:00:00']);
        $this->request($ssd, $somchai, 1, 'fulfilled', '2026-09-21 09:00:00', ['fulfilled_at' => '2026-09-22 09:00:00']);
        $this->request($ssd, $suda, 3, 'fulfilled', '2026-09-20 09:00:00', ['fulfilled_at' => '2026-09-21 09:00:00']);
        $this->request($cable, $nobody, 4, 'fulfilled', '2026-09-04 09:00:00', ['fulfilled_at' => '2026-09-05 09:00:00']);
        $this->request($ssd, $somchai, 9, 'fulfilled', '2025-08-30 09:00:00', ['fulfilled_at' => '2025-09-01 09:00:00']);
        $this->request($ssd, $somchai, 1, 'pending', '2026-09-20 09:00:00');
        $this->request($cable, $suda, 2, 'pending', '2026-09-01 09:00:00');
        $this->request($ssd, $nobody, 1, 'approved', '2026-09-10 09:00:00', ['approved_at' => '2026-09-11 09:00:00']);
        $this->request($ssd, $nobody, 1, 'rejected', '2026-09-02 09:00:00', ['rejected_at' => '2026-09-03 09:00:00']);

        $this->stockCount('SC-2026-001', 'Main', 'committed', '2026-09-21 12:00:00', [[$ssd, 10, 12], [$cable, 5, 5], [$mouse, 6, 4]]);
        $this->stockCount('SC-2026-002', 'Branch', 'committed', '2026-09-05 12:00:00', [[$cable, 3, 2], [$mouse, 1, null]]);
        $this->stockCount('SC-2026-003', 'Main', 'draft', null, [[$ssd, 10, 1]]);
        $this->stockCount('SC-2025-001', 'Main', 'committed', '2025-09-01 12:00:00', [[$ssd, 10, 1]]);

        $this->s = compact('parts', 'cables', 'main', 'branch', 'ssd', 'cable', 'mouse', 'it', 'hr', 'somchai', 'suda', 'nobody');
    }

    /** @return array<string, mixed> */
    private function breakdown(string $query = '', ?array $permissions = null): array
    {
        $permissions ??= $this->reportRights('stock');

        return $this->actingAs($this->userWith($permissions))
            ->getJson('/api/reports/stock/movements/breakdown'.($query === '' ? '' : '?'.$query))
            ->assertOk()->json('data');
    }

    // ── tiles and months ─────────────────────────────────────────────────────────────

    public function test_tiles_give_pieces_value_and_times_per_type(): void
    {
        $this->seedStock();

        $tiles = $this->breakdown()['tiles'];

        $this->assertEquals(['qty' => 20, 'value' => 3000, 'times' => 2], $tiles['receive']);
        // 4 @100 + 2 @150 + 1 before any lot @100 (oldest lot) + 5 cables @30 (item cost)
        $this->assertEquals(['qty' => 12, 'value' => 950, 'times' => 4], $tiles['issue']);
        $this->assertEquals(['qty' => 1, 'value' => 150, 'times' => 1], $tiles['return']);
        $this->assertEquals(['qty' => 3, 'value' => 450, 'times' => 1], $tiles['transfer']);
        $this->assertEquals(['qty' => 2, 'value' => 200, 'times' => 1], $tiles['adjust_up']);
        $this->assertEquals(['qty' => 1, 'value' => 150, 'times' => 1], $tiles['adjust_down']);
    }

    public function test_months_cover_the_range_only(): void
    {
        $this->seedStock();

        $months = $this->breakdown()['months'];

        $this->assertCount(12, $months);
        $this->assertSame('2025-10', $months[0]['month']);
        $this->assertSame('2026-09', $months[11]['month']);
        $this->assertEquals([
            'month' => '2026-09', 'receive' => 20, 'return' => 1, 'issue' => 6, 'transfer' => 3,
            'receive_value' => 3000, 'issue_value' => 700, 'adjust_net' => 1,
        ], $months[11]);
        $this->assertSame(1, $months[10]['issue']);
        $this->assertEquals(100, $months[10]['issue_value']);
        $this->assertSame(5, $months[9]['issue']);

        // A short range: the chart shows its months only and counts what the tiles count
        $short = $this->breakdown('from=2026-08-01&to=2026-09-15');
        $this->assertSame(10, $short['tiles']['receive']['qty']);
        $this->assertSame(5, $short['tiles']['issue']['qty']);
        $this->assertSame(0, $short['tiles']['return']['qty']);
        $this->assertSame(['2026-08', '2026-09'], array_column($short['months'], 'month'));
        $this->assertSame(10, array_sum(array_column($short['months'], 'receive')));
        $this->assertSame(5, array_sum(array_column($short['months'], 'issue')));
        $this->assertSame(0, array_sum(array_column($short['months'], 'return')));
    }

    public function test_a_renamed_warehouse_keeps_its_history_in_the_report(): void
    {
        $this->seedStock();
        $before = $this->breakdown('warehouse_id='.$this->s['main']->id);

        $this->s['main']->update(['name' => 'Main Store']);
        $after = $this->breakdown('warehouse_id='.$this->s['main']->id);

        $this->assertSame(20, $before['tiles']['receive']['qty']);
        $this->assertSame($before['tiles'], $after['tiles']);
        $this->assertSame(array_column($before['counts'], 'reference'), array_column($after['counts'], 'reference'));
        $this->assertSame(
            $this->actingAs($this->userWith($this->reportRights('stock')))->getJson('/api/reports/tabular/stock.movements/rows?warehouse_id='.$this->s['main']->id.'&from=2025-01-01')->json('meta.total'),
            StockMovement::query()->where(fn ($q) => $q->where('from_warehouse_id', $this->s['main']->id)->orWhere('to_warehouse_id', $this->s['main']->id))->count(),
        );
    }

    public function test_a_manual_count_books_nothing_so_it_is_not_a_variance(): void
    {
        $this->seedStock();
        $manual = $this->stockCount('SC-2026-009', 'Main', 'committed', '2026-09-24 10:00:00', [[$this->s['ssd'], 10, 7]]);
        $manual->update(['adjust_mode' => 'manual']);

        $this->assertNotContains('SC-2026-009', array_column($this->breakdown()['counts'], 'reference'));
    }

    public function test_an_all_warehouse_count_shows_under_the_warehouse_it_adjusted(): void
    {
        $this->seedStock();
        $this->stockCount('SC-2026-010', null, 'committed', '2026-09-24 11:00:00', [[$this->s['ssd'], 10, 8], [$this->s['cable'], 5, 6]]);
        $this->movement($this->s['ssd'], 'adjust_down', 2, '2026-09-24 11:00:00', ['from_label' => 'Main', 'reference' => 'SC-2026-010']);
        $this->movement($this->s['cable'], 'adjust_up', 1, '2026-09-24 11:00:00', ['to_label' => 'Branch', 'reference' => 'SC-2026-010']);

        $main = collect($this->breakdown('warehouse_id='.$this->s['main']->id)['counts'])->keyBy('reference');
        $branch = collect($this->breakdown('warehouse_id='.$this->s['branch']->id)['counts'])->keyBy('reference');

        $this->assertEquals(['lines' => 1, 'up' => 0, 'down' => 2], collect($main['SC-2026-010'])->only('lines', 'up', 'down')->all());
        $this->assertEquals(['lines' => 1, 'up' => 1, 'down' => 0], collect($branch['SC-2026-010'])->only('lines', 'up', 'down')->all());
    }

    public function test_warehouse_and_category_narrow_the_breakdown_but_type_does_not(): void
    {
        $this->seedStock();

        $branch = $this->breakdown('warehouse_id='.$this->s['branch']->id)['tiles'];
        $this->assertSame(3, $branch['transfer']['qty']);
        $this->assertSame(5, $branch['issue']['qty']);
        $this->assertSame(0, $branch['receive']['qty']);

        $cables = $this->breakdown('category_id='.$this->s['cables']->id)['tiles'];
        $this->assertEquals(['qty' => 5, 'value' => 150, 'times' => 1], $cables['issue']);
        $this->assertSame(0, $cables['receive']['qty']);

        $this->assertSame(20, $this->breakdown('type=issue')['tiles']['receive']['qty']);
    }

    // ── requests, requesters, departments ───────────────────────────────────────────

    public function test_waiting_requests_are_as_of_today_oldest_first(): void
    {
        $this->seedStock();

        $requests = $this->breakdown('from=2025-01-01&to=2025-01-31')['requests'];

        $this->assertSame(2, $requests['pending']);
        $this->assertSame(1, $requests['approved']);
        $this->assertSame(['pending', 'approved', 'pending'], array_column($requests['rows'], 'status'));
        $this->assertSame(['LAN cable', 'SSD 1TB', 'SSD 1TB'], array_column($requests['rows'], 'item_name'));
        $first = $requests['rows'][0];
        $this->assertSame(['reference', 'item_name', 'sku', 'qty', 'unit', 'requester', 'requester_th', 'status', 'created_at', 'waiting_since'], array_keys($first));
        $this->assertSame(2, $first['qty']);
        $this->assertSame('pcs', $first['unit']);
        $this->assertSame('Suda', $first['requester']);
        $this->assertSame([null, null, 'สมชาย ใจดี'], array_column($requests['rows'], 'requester_th'));
        $this->assertTrue(CarbonImmutable::parse($first['created_at'])->equalTo(CarbonImmutable::parse('2026-09-01 09:00:00')));

        $parts = $this->breakdown('category_id='.$this->s['parts']->id)['requests'];
        $this->assertSame(1, $parts['pending']);
        $this->assertSame(1, $parts['approved']);
        $this->assertCount(2, $parts['rows']);
    }

    public function test_an_approved_request_waits_from_its_approval_a_pending_one_from_its_filing(): void
    {
        $this->seedStock();
        $approved = $this->request($this->s['ssd'], $this->s['suda'], 1, 'approved', '2026-09-10 09:00:00', ['approved_at' => '2026-09-24 15:00:00']);

        $rows = collect($this->breakdown()['requests']['rows'])->keyBy('reference');
        $row = $rows[$approved->fresh()->reference];
        $pending = collect($rows)->firstWhere('status', 'pending');

        $this->assertTrue(CarbonImmutable::parse($row['waiting_since'])->equalTo(CarbonImmutable::parse('2026-09-24 15:00:00')));
        $this->assertSame($pending['created_at'], $pending['waiting_since']);
    }

    public function test_requesters_and_departments_count_fulfilled_requests_in_the_range(): void
    {
        $this->seedStock();

        $data = $this->breakdown();
        $people = collect($data['people'])->keyBy('name');

        $this->assertCount(3, $people);
        // 2 @100 on 10 Sep + 1 @150 on 22 Sep
        $this->assertEquals(['qty' => 3, 'value' => 350, 'times' => 2], collect($people['Somchai'])->only('qty', 'value', 'times')->all());
        $this->assertSame($this->s['somchai']->id, $people['Somchai']['user_id']);
        $this->assertSame('สมชาย ใจดี', $people['Somchai']['name_th']);
        $this->assertNull($people['Suda']['name_th']);
        $this->assertNull($people['Nobody']['name_th']);
        $this->assertSame('Information Technology', $people['Somchai']['department']);
        $this->assertEquals(['qty' => 3, 'value' => 450, 'times' => 1], collect($people['Suda'])->only('qty', 'value', 'times')->all());
        $this->assertEquals(['qty' => 4, 'value' => 120, 'times' => 1], collect($people['Nobody'])->only('qty', 'value', 'times')->all());
        $this->assertNull($people['Nobody']['department_id']);

        $departments = collect($data['departments'])->keyBy(fn (array $d) => $d['department_id'] ?? 'none');
        $this->assertCount(3, $departments);
        $this->assertEquals(['name' => 'Information Technology', 'people' => 1, 'qty' => 3, 'value' => 350, 'times' => 2],
            collect($departments[$this->s['it']->id])->only('name', 'people', 'qty', 'value', 'times')->all());
        $this->assertSame(450.0, (float) $departments[$this->s['hr']->id]['value']);
        $this->assertNull($departments['none']['name']);
        $this->assertSame(4, $departments['none']['qty']);

        $cables = $this->breakdown('category_id='.$this->s['cables']->id);
        $this->assertSame(['Nobody'], array_column($cables['people'], 'name'));
        $this->assertSame([null], array_column($cables['departments'], 'department_id'));
    }

    // ── counts ──────────────────────────────────────────────────────────────────────

    public function test_counts_give_differing_lines_and_net_value_newest_first(): void
    {
        $this->seedStock();

        $counts = $this->breakdown()['counts'];

        $this->assertSame(['SC-2026-001', 'SC-2026-002'], array_column($counts, 'reference'));
        // SSD +2 @150 on 21 Sep, Mouse −2 @10; the unchanged cable line does not count
        $this->assertEquals(['reference' => 'SC-2026-001', 'warehouse' => 'Main', 'lines' => 2, 'up' => 2, 'down' => 2, 'net_value' => 280],
            collect($counts[0])->except('committed_at')->all());
        $this->assertEquals(['lines' => 1, 'up' => 0, 'down' => 1, 'net_value' => -30], collect($counts[1])->only('lines', 'up', 'down', 'net_value')->all());

        $main = $this->breakdown('warehouse_id='.$this->s['main']->id)['counts'];
        $this->assertSame(['SC-2026-001'], array_column($main, 'reference'));

        $parts = $this->breakdown('category_id='.$this->s['parts']->id)['counts'];
        $this->assertSame(['SC-2026-001'], array_column($parts, 'reference'));
        $this->assertEquals(['lines' => 1, 'up' => 2, 'down' => 0, 'net_value' => 300], collect($parts[0])->only('lines', 'up', 'down', 'net_value')->all());

        $cables = $this->breakdown('category_id='.$this->s['cables']->id)['counts'];
        $this->assertSame(['SC-2026-001', 'SC-2026-002'], array_column($cables, 'reference'));
        $this->assertEquals(-20, $cables[0]['net_value']);
    }

    // ── gating, filters, permission ─────────────────────────────────────────────────

    public function test_every_card_is_shown_to_a_stock_report_reader(): void
    {
        $this->seedStock();

        $reader = $this->breakdown('', $this->reportRights('stock'));

        $this->assertNotEmpty($reader['tiles']);
        $this->assertCount(12, $reader['months']);
        $this->assertNotNull($reader['requests']);
        $this->assertNotNull($reader['people']);
        $this->assertNotNull($reader['departments']);
        $this->assertCount(2, $reader['counts']);
    }

    public function test_bad_filters_are_refused_and_the_report_permission_is_needed(): void
    {
        $user = $this->userWith($this->reportRights('stock'));
        $this->actingAs($user)->getJson('/api/reports/stock/movements/breakdown?from=25-09-2026')->assertUnprocessable();
        $this->actingAs($user)->getJson('/api/reports/stock/movements/breakdown?warehouse_id=999')->assertUnprocessable();
        $this->actingAs($user)->getJson('/api/reports/stock/movements/breakdown?type=lost')->assertUnprocessable();

        $this->actingAs($this->userWith(['stock.module', 'stock.view', 'stock.view_events', ...$this->reportRights('assets')]))
            ->getJson('/api/reports/stock/movements/breakdown')->assertForbidden();
    }

    public function test_an_empty_stock_gives_zeros(): void
    {
        $data = $this->breakdown();

        $this->assertEquals(['qty' => 0, 'value' => 0, 'times' => 0], $data['tiles']['issue']);
        $this->assertCount(12, $data['months']);
        $this->assertSame(['pending' => 0, 'approved' => 0, 'rows' => []], $data['requests']);
        $this->assertSame([], $data['people']);
        $this->assertSame([], $data['departments']);
        $this->assertSame([], $data['counts']);
    }

    // ── value rule and default range ────────────────────────────────────────────────

    public function test_an_issue_is_valued_at_the_average_lot_cost_of_its_day(): void
    {
        $this->seedStock();

        $rows = collect($this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->getJson('/api/reports/tabular/stock.movements/rows?from=2026-09-01&to=2026-09-30')->assertOk()->json('data'))
            ->keyBy(fn (array $r) => $r['type'].'@'.substr($r['moved_at'], 0, 10));

        // The 10 Sep issue takes the first lot only, not the later 200 lot.
        $this->assertEqualsWithDelta(400.0, $rows['issue@2026-09-10']['line_value'], 0.001);
        $this->assertEqualsWithDelta(300.0, $rows['issue@2026-09-22']['line_value'], 0.001);
        $this->assertEqualsWithDelta(2000.0, $rows['receive@2026-09-20']['line_value'], 0.001);
        $this->assertEqualsWithDelta(450.0, $rows['transfer@2026-09-24']['line_value'], 0.001);
        $this->assertNull($rows['issue@2026-09-10']['unit_cost']);
    }

    public function test_a_receipt_without_a_cost_has_one_value_in_the_summary_rows_and_tiles(): void
    {
        $this->seedStock();
        // No unit_cost: valued at the average lot cost of 21 Sep (150).
        $this->movement($this->s['ssd'], 'receive', 4, '2026-09-21 10:00:00', ['to_label' => 'Main']);
        $user = $this->userWith($this->reportRights('stock'));

        $body = $this->actingAs($user)->getJson('/api/reports/tabular/stock.movements/rows?type=receive')->assertOk()->json();
        $summary = collect($body['summary'])->keyBy('key')['receive_value']['value'];
        $rows = array_sum(array_column($body['data'], 'line_value'));
        $tiles = $this->breakdown()['tiles']['receive']['value'];

        $this->assertEqualsWithDelta(3600.0, $summary, 0.001);
        $this->assertEqualsWithDelta($summary, $rows, 0.001);
        $this->assertEqualsWithDelta($summary, $tiles, 0.001);
    }

    public function test_the_cost_book_falls_back_from_lots_to_the_oldest_lot_to_the_item_cost(): void
    {
        $this->seedStock();
        $book = StockCostBook::forItems([$this->s['ssd']->id, $this->s['cable']->id, $this->s['mouse']->id, 999]);
        $day = fn (string $d) => CarbonImmutable::parse($d);

        $this->assertEqualsWithDelta(100.0, $book->averageAt($this->s['ssd']->id, $day('2026-08-01')), 0.001);
        $this->assertEqualsWithDelta(100.0, $book->averageAt($this->s['ssd']->id, $day('2026-09-19')), 0.001);
        // A lot received later the same day counts.
        $this->assertEqualsWithDelta(150.0, $book->averageAt($this->s['ssd']->id, $day('2026-09-20 00:00:00')), 0.001);
        $this->assertEqualsWithDelta(30.0, $book->averageAt($this->s['cable']->id, $day('2026-09-20')), 0.001);
        $this->assertSame(0.0, $book->averageAt(999, $day('2026-09-20')));
        $this->assertEqualsWithDelta(10.0, $book->averageAt($this->s['mouse']->id, $day('2026-09-20')), 0.001);
    }

    public function test_the_default_range_is_the_last_twelve_months(): void
    {
        $item = $this->item('SSD', Category::create(['name' => 'Parts']), 0);
        $this->movement($item, 'receive', 1, '2025-09-30 23:59:00', ['unit_cost' => 1]);
        $first = $this->movement($item, 'receive', 1, '2025-10-01 00:00:00', ['unit_cost' => 1]);
        $last = $this->movement($item, 'issue', 1, '2026-09-25 08:00:00');
        $user = $this->userWith([...$this->reportRights('stock')]);

        $ids = array_column($this->actingAs($user)->getJson('/api/reports/tabular/stock.movements/rows')->assertOk()->json('data'), 'id');
        $this->assertSame([$first->id, $last->id], $ids);

        $filters = collect($this->actingAs($user)->getJson('/api/reports/tabular/stock.movements')->assertOk()->json('data.filters') ?? [])->keyBy('name');
        $this->assertSame('2025-10-01', $filters['from']['default']);
        $this->assertSame('2026-09-25', $filters['to']['default']);
    }

    // ── export ──────────────────────────────────────────────────────────────────────

    public function test_export_sections_carry_every_card(): void
    {
        $this->seedStock();
        $report = new StockMovementReport;
        $titles = fn (array $permissions) => array_column($report->exportSections($this->userWith($permissions), $report->resolveFilters([])), 'title');

        $this->assertSame(['รับเข้าและเบิกออกรายเดือน', 'ผู้ขอเบิกสูงสุด', 'แผนกที่เบิกสูงสุด', 'ส่วนต่างจากการนับสต็อก'], $titles($this->reportRights('stock')));

        $sections = collect((new StockMovementReport)->exportSections($this->userWith($this->reportRights('stock')), $report->resolveFilters(['from' => '2026-08-01', 'to' => '2026-09-30'])))->keyBy('title');
        $this->assertCount(2, $sections['รับเข้าและเบิกออกรายเดือน']['rows']);
        $this->assertSame(['Suda', 'สมชาย ใจดี', 'Nobody'], array_column($sections['ผู้ขอเบิกสูงสุด']['rows'], 0));
        $this->assertSame('บุคคล', $sections['ผู้ขอเบิกสูงสุด']['rows'][0][1]);
        $this->assertSame('ไม่มีแผนก', $sections['แผนกที่เบิกสูงสุด']['rows'][2][0]);
        $this->assertSame(['SC-2026-001', 'SC-2026-002'], array_column($sections['ส่วนต่างจากการนับสต็อก']['rows'], 0));
    }

    public function test_xlsx_export_carries_the_section_sheets(): void
    {
        Excel::fake();
        $this->seedStock();

        $this->actingAs($this->userWith([...$this->reportRights('stock')]))
            ->exportReport('/api/reports/tabular/stock.movements/export?format=xlsx')->assertAccepted();

        $this->assertExportStored('Report_stock-movements_2026-09-25.xlsx', function (TabularReportExport $export) {
            $rows = collect($export->sheets())->first(fn (object $s) => $s instanceof TabularRowsSheet);

            return array_column($export->sections, 'title') === ['รับเข้าและเบิกออกรายเดือน', 'ผู้ขอเบิกสูงสุด', 'แผนกที่เบิกสูงสุด', 'ส่วนต่างจากการนับสต็อก']
                && $rows !== null
                && in_array('มูลค่า', $rows->headings(), true);
        });
    }
}
