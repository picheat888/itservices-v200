<?php

// Stock valuation for a past day follows the lot ledger (entries x lot cost), not the newest lots received.

namespace Tests\Feature\Report;

use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockRequest;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\GrantsReports;
use Tests\TestCase;

class StockValuationLedgerTest extends TestCase
{
    use GrantsReports;
    use RefreshDatabase;

    private User $viewer;

    private User $super;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        Warehouse::create(['name' => 'A']);
        $role = Role::create(['key' => 'rep_ledger', 'name' => 'Report Test', 'is_system' => false]);
        foreach ($this->reportRights('stock') as $permission) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $permission, 'allowed' => true]);
        }
        $this->viewer = User::factory()->create(['role' => $role->key]);
        $this->super = User::factory()->create(['role' => 'super']);
        $this->travelTo('2026-09-10 10:00:00');
    }

    private function valueAsOf(string $day, StockItem $item): float
    {
        $rows = $this->actingAs($this->viewer)->getJson('/api/reports/tabular/stock.valuation/rows?as_of='.$day)->assertOk()->json('data');
        $row = collect($rows)->firstWhere('sku', $item->sku);

        return (float) ($row['stock_value'] ?? 0);
    }

    public function test_past_day_value_follows_the_ledger_not_the_newest_lots(): void
    {
        $this->actingAs($this->super);
        $item = StockItem::create(['sku' => 'SK-LED-1', 'name' => 'Ledger item', 'unit' => 'unit', 'cost' => 100]);

        // Day 1: L1 6 at 890, day 2: L2 21 at 920
        $this->travelTo('2026-09-01 10:00:00');
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 6, 'unit_cost' => 890, 'to_label' => 'A', 'moved_at' => '2026-09-01 10:00:00'])->assertCreated();
        $this->travelTo('2026-09-02 10:00:00');
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 21, 'unit_cost' => 920, 'to_label' => 'A', 'moved_at' => '2026-09-02 10:00:00'])->assertCreated();
        $l2 = StockLot::where('stock_item_id', $item->id)->latest('id')->firstOrFail();

        // Day 3: issue 10 (L1 6, L2 4)
        $this->travelTo('2026-09-03 10:00:00');
        $request = StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $this->super->id, 'requester_name' => 'Asker',
            'qty' => 10, 'reason' => 'Use', 'status' => 'approved',
        ]);
        $this->postJson("/api/stock-requests/{$request->id}/fulfill", ['allocations' => [['warehouse' => 'A', 'qty' => 10]]])->assertOk();

        // Day 4: return 3 into L2
        $this->travelTo('2026-09-04 10:00:00');
        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'stock_request_id' => $request->id,
            'lots' => [['lot_id' => $l2->id, 'qty' => 3]], 'moved_at' => '2026-09-04 10:00:00',
        ])->assertCreated();

        $this->travelTo('2026-09-10 10:00:00');
        $this->assertSame(6 * 890.0, $this->valueAsOf('2026-09-01', $item));
        $this->assertSame(15640.0, $this->valueAsOf('2026-09-03', $item));
        $this->assertSame(18400.0, $this->valueAsOf('2026-09-04', $item));
        $this->assertSame(18400.0, $this->valueAsOf('2026-09-10', $item));
    }

    public function test_past_day_value_prices_a_return_into_an_old_lot_at_that_lots_cost(): void
    {
        $this->actingAs($this->super);
        $item = StockItem::create(['sku' => 'SK-LED-2', 'name' => 'Ledger item', 'unit' => 'unit', 'cost' => 100]);

        // Day 1: L1 6 at 890, day 2: L2 21 at 920
        $this->travelTo('2026-09-01 10:00:00');
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 6, 'unit_cost' => 890, 'to_label' => 'A', 'moved_at' => '2026-09-01 10:00:00'])->assertCreated();
        $this->travelTo('2026-09-02 10:00:00');
        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 21, 'unit_cost' => 920, 'to_label' => 'A', 'moved_at' => '2026-09-02 10:00:00'])->assertCreated();
        $l2 = StockLot::where('stock_item_id', $item->id)->latest('id')->firstOrFail();
        $l1 = StockLot::where('stock_item_id', $item->id)->oldest('id')->firstOrFail();

        // Day 3: issue 10 (L1 6, L2 4)
        $this->travelTo('2026-09-03 10:00:00');
        $request = StockRequest::create([
            'stock_item_id' => $item->id, 'user_id' => $this->super->id, 'requester_name' => 'Asker',
            'qty' => 10, 'reason' => 'Use', 'status' => 'approved',
        ]);
        $this->postJson("/api/stock-requests/{$request->id}/fulfill", ['allocations' => [['warehouse' => 'A', 'qty' => 10]]])->assertOk();

        // Day 4: return 3 into L2
        $this->travelTo('2026-09-04 10:00:00');
        $this->postJson('/api/stock-movements', [
            'type' => 'return', 'stock_item_id' => $item->id, 'stock_request_id' => $request->id,
            'lots' => [['lot_id' => $l1->id, 'qty' => 3]], 'moved_at' => '2026-09-04 10:00:00',
        ])->assertCreated();

        $this->travelTo('2026-09-10 10:00:00');
        $this->assertSame(6 * 890.0, $this->valueAsOf('2026-09-01', $item));
        $this->assertSame(15640.0, $this->valueAsOf('2026-09-03', $item));
        $this->assertSame(18310.0, $this->valueAsOf('2026-09-04', $item));
        $this->assertSame(18310.0, $this->valueAsOf('2026-09-10', $item));
    }
}
