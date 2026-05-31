<?php

namespace Tests\Feature;

use App\Models\StockBalance;
use App\Models\StockItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
