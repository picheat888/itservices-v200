<?php

namespace Tests\Feature;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Support\LotNumber;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class StockLotNumberTest extends TestCase
{
    use RefreshDatabase;

    private function makeLot(string $lotNo, ?StockItem $item = null): StockLot
    {
        $item ??= StockItem::create(['sku' => 'SK-'.fake()->unique()->numerify('####'), 'name' => 'Lot item', 'unit' => 'unit']);

        return StockLot::create([
            'stock_item_id' => $item->id,
            'lot_no' => $lotNo,
            'unit_cost' => 0,
            'qty_received' => 1,
            'qty_remaining' => 1,
            'received_at' => now(),
        ]);
    }

    public function test_first_number_of_a_day_is_0001(): void
    {
        $this->assertSame('LOT-20261028-0001', LotNumber::next(Carbon::parse('2026-10-28 15:00')));
    }

    public function test_sequence_counts_across_items_per_day(): void
    {
        $this->makeLot('LOT-20261028-0001');
        $this->makeLot('LOT-20261028-0002');

        $this->assertSame('LOT-20261028-0003', LotNumber::next(Carbon::parse('2026-10-28')));
        $this->assertSame('LOT-20261029-0001', LotNumber::next(Carbon::parse('2026-10-29')));
    }

    public function test_sequence_passes_9999_numerically(): void
    {
        $this->makeLot('LOT-20261028-9999');

        $this->assertSame('LOT-20261028-10000', LotNumber::next(Carbon::parse('2026-10-28')));
    }

    public function test_lot_no_is_unique(): void
    {
        $this->makeLot('LOT-20261028-0001');

        $this->expectException(QueryException::class);
        $this->makeLot('LOT-20261028-0001');
    }
}
