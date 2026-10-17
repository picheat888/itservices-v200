<?php

namespace Tests\Feature;

use App\Models\Stock\StockCount;
use App\Models\Stock\StockCountLine;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

// Stock list, summary and count endpoints must not run a query per item, lot or line
class StockQueryCountTest extends TestCase
{
    use RefreshDatabase;

    private function addItem(int $i): StockItem
    {
        // 6 on hand against a minimum of 8: shows up in the summary's low list
        $item = StockItem::create(['sku' => sprintf('SKU-%07d', $i), 'name' => "Item {$i}", 'cost' => 100, 'current_stock' => 6, 'min_stock' => 8, 'max_stock' => 20, 'last_move_at' => now()]);
        foreach ([1, 2] as $n) {
            $movement = StockMovement::create(['doc_no' => sprintf('RCV-2026-%03d%d', $i, $n), 'type' => 'receive', 'stock_item_id' => $item->id, 'qty' => 3, 'unit_cost' => 100, 'to_label' => 'Main', 'moved_at' => now()]);
            StockLot::create(['stock_item_id' => $item->id, 'stock_movement_id' => $movement->id, 'unit_cost' => 100, 'qty_received' => 3, 'qty_remaining' => 3, 'received_at' => now()]);
        }

        return $item;
    }

    private function queries(string $url): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs(User::factory()->create(['role' => 'super']))->getJson($url)->assertOk();

        return count(DB::getQueryLog());
    }

    public function test_item_endpoints_use_the_same_number_of_queries_for_5_or_25_items(): void
    {
        for ($i = 1; $i <= 5; $i++) {
            $this->addItem($i);
        }
        $this->queries('/api/stock-items');
        $this->queries('/api/stock-items/summary');
        $small = [$this->queries('/api/stock-items'), $this->queries('/api/stock-items/summary')];

        for ($i = 6; $i <= 25; $i++) {
            $this->addItem($i);
        }
        $large = [$this->queries('/api/stock-items'), $this->queries('/api/stock-items/summary')];

        $this->assertSame($small[0], $large[0], 'the item list runs more queries as items grow');
        $this->assertSame($small[1], $large[1], 'the summary runs more queries as items grow');
    }

    public function test_count_list_uses_the_same_number_of_queries_for_2_or_8_lines(): void
    {
        $counter = User::factory()->create(['role' => 'super']);
        $count = StockCount::create(['reference' => 'SC-2026-001', 'status' => 'draft', 'counted_by' => $counter->id]);
        $line = fn (int $i) => StockCountLine::create(['stock_count_id' => $count->id, 'stock_item_id' => $this->addItem($i)->id, 'system_qty' => 6, 'counted_qty' => 6]);

        $line(1);
        $line(2);
        $this->queries('/api/stock-counts');
        $small = $this->queries('/api/stock-counts');
        foreach (range(3, 8) as $i) {
            $line($i);
        }

        $this->assertSame($small, $this->queries('/api/stock-counts'), 'the count list runs more queries as lines grow');
    }
}
