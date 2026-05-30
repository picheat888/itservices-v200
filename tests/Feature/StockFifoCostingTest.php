<?php

namespace Tests\Feature;

use App\Models\StockItem;
use App\Models\StockLot;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockFifoCostingTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function item(): StockItem
    {
        return StockItem::create([
            'sku' => 'SK-FIFO-1', 'name' => 'Widget', 'unit' => 'unit',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'warehouse' => 'Main',
        ]);
    }

    private function receive(StockItem $item, int $qty, float $cost): void
    {
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'qty' => $qty, 'unit_cost' => $cost,
        ])->assertCreated();
    }

    public function test_new_sku_ignores_current_and_cost_and_starts_empty(): void
    {
        $this->actingAs($this->super())
            ->postJson('/api/stock-items', [
                'sku' => 'SK-NEW-1', 'name' => 'Fresh', 'unit' => 'unit', 'min_stock' => 1, 'max_stock' => 10,
                // even if a client sends these, they must be ignored now
                'current_stock' => 99, 'cost' => 555,
            ])
            ->assertCreated()
            ->assertJsonPath('data.current_stock', 0)
            ->assertJsonPath('data.cost', 0)
            ->assertJsonPath('data.total_value', 0);
    }

    public function test_two_receive_lots_value_is_sum_of_lots(): void
    {
        $item = $this->item();
        $this->actingAs($this->super());

        $this->receive($item, 10, 100);   // value 1000
        $this->receive($item, 5, 200);    // value 1000

        $this->assertSame(15, $item->fresh()->current_stock);
        $this->assertSame(2000.0, $item->fresh()->stockValue());
        $this->assertEqualsWithDelta(133.33, $item->fresh()->avgCost(), 0.01);
    }

    public function test_outbound_consumes_oldest_lot_first_fifo(): void
    {
        $item = $this->item();
        $this->actingAs($this->super());

        $this->receive($item, 10, 100);   // lot A @100
        $this->receive($item, 10, 250);   // lot B @250

        // Outbound 12 (transfer) → all of lot A (10) + 2 of lot B → remaining 8 @250 = 2000
        $this->postJson('/api/stock-movements', ['type' => 'transfer', 'stock_item_id' => $item->id, 'qty' => 12])
            ->assertCreated();

        $item->refresh();
        $this->assertSame(8, $item->current_stock);
        $this->assertSame(2000.0, $item->stockValue());

        $lotA = StockLot::where('stock_item_id', $item->id)->orderBy('id')->first();
        $this->assertSame(0, $lotA->qty_remaining);
    }

    public function test_receive_without_cost_is_allowed_and_values_zero(): void
    {
        $item = $this->item();
        $this->actingAs($this->super());

        $this->postJson('/api/stock-movements', ['type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 4])
            ->assertCreated();

        $this->assertSame(4, $item->fresh()->current_stock);
        $this->assertSame(0.0, $item->fresh()->stockValue());
    }
}
