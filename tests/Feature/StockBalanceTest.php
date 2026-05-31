<?php

namespace Tests\Feature;

use App\Models\StockBalance;
use App\Models\StockItem;
use App\Models\User;
use App\Services\StockBalanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class StockBalanceTest extends TestCase
{
    use RefreshDatabase;

    private function item(int $stock = 0): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-BAL-'.fake()->unique()->numerify('###'),
            'name' => 'Balance item', 'unit' => 'unit', 'cost' => 0,
            'current_stock' => $stock, 'min_stock' => 0, 'max_stock' => 0, 'warehouse' => 'WH-A',
        ]);
    }

    public function test_item_has_many_balances(): void
    {
        $item = $this->item();
        StockBalance::create(['stock_item_id' => $item->id, 'warehouse' => 'WH-A', 'qty' => 5]);
        StockBalance::create(['stock_item_id' => $item->id, 'warehouse' => 'WH-B', 'qty' => 3]);

        $this->assertSame(8, (int) $item->balances()->sum('qty'));
        $this->assertCount(2, $item->balances);
    }

    public function test_add_creates_and_increments_balance(): void
    {
        $svc = app(StockBalanceService::class);
        $item = $this->item();

        $svc->add($item, 'WH-A', 5);
        $svc->add($item, 'WH-A', 3);

        $this->assertSame(8, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-A'])->value('qty'));
    }

    public function test_remove_decrements_and_rejects_negative(): void
    {
        $svc = app(StockBalanceService::class);
        $item = $this->item();
        $svc->add($item, 'WH-A', 5);

        $svc->remove($item, 'WH-A', 2);
        $this->assertSame(3, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-A'])->value('qty'));

        $this->expectException(ValidationException::class);
        $svc->remove($item, 'WH-A', 99);
    }

    public function test_move_transfers_between_warehouses(): void
    {
        $svc = app(StockBalanceService::class);
        $item = $this->item();
        $svc->add($item, 'WH-A', 10);

        $svc->move($item, 'WH-A', 'WH-B', 4);

        $this->assertSame(6, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-A'])->value('qty'));
        $this->assertSame(4, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-B'])->value('qty'));
    }

    public function test_move_rejects_same_warehouse(): void
    {
        $svc = app(StockBalanceService::class);
        $item = $this->item();
        $svc->add($item, 'WH-A', 10);

        $this->expectException(ValidationException::class);
        $svc->move($item, 'WH-A', 'WH-A', 1);
    }

    public function test_summary_groups_units_by_balance_warehouse(): void
    {
        $user = User::factory()->create(['role' => 'super']);
        $item = $this->item(0);
        app(StockBalanceService::class)->add($item, 'WH-A', 7);
        app(StockBalanceService::class)->add($item, 'WH-B', 3);
        $item->update(['current_stock' => 10]);

        $res = $this->actingAs($user)->getJson('/api/stock-items/summary')->assertOk();
        $byWh = collect($res->json('by_warehouse'))->keyBy('warehouse');

        $this->assertSame(7, $byWh['WH-A']['units']);
        $this->assertSame(3, $byWh['WH-B']['units']);
    }

    public function test_rebuild_for_seeds_single_balance_from_current_stock(): void
    {
        $svc = app(StockBalanceService::class);
        $item = $this->item(12);

        $svc->rebuildFor($item);

        $this->assertSame(12, (int) StockBalance::where(['stock_item_id' => $item->id, 'warehouse' => 'WH-A'])->value('qty'));
    }
}
