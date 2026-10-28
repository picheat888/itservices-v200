<?php

namespace Tests\Concerns;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Services\Stock\StockLotService;

// Test fixture: park stock in a warehouse as a balance plus a matching lot, so later draws find lots.
trait ParksStockOnLots
{
    /** Add a balance row and one lot of the same qty; in-stock serials there without a lot join it. */
    protected function parkStock(StockItem $item, int $warehouseId, int $qty, float $unitCost = 100): void
    {
        $item->balances()->create(['warehouse_id' => $warehouseId, 'qty' => $qty]);
        if ($qty <= 0) {
            return;
        }

        $lot = app(StockLotService::class)->open($item, $warehouseId, $qty, $unitCost, null);
        StockItemSerial::where('stock_item_id', $item->id)
            ->where('warehouse_id', $warehouseId)
            ->where('status', 'in_stock')
            ->whereNull('stock_lot_id')
            ->update(['stock_lot_id' => $lot->id]);
    }
}
