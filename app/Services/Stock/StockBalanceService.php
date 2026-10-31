<?php

namespace App\Services\Stock;

use App\Models\Stock\StockBalance;
use App\Models\Stock\StockItem;
use App\Models\Stock\Warehouse;
use App\Support\Refusal;

/** Per-warehouse on-hand quantities (stock_balances) by warehouse name or row; "Unassigned" maps to no row, and removals never go below zero. */
class StockBalanceService
{
    /** Increment (or create) the balance for a warehouse. */
    public function add(StockItem $item, string $warehouse, int $qty): void
    {
        $this->increment($item, Warehouse::resolveId($warehouse), $qty);
    }

    /** Decrement the balance for a warehouse, rejecting an over-draw. */
    public function remove(StockItem $item, string $warehouse, int $qty): void
    {
        $this->decrement($item, Warehouse::resolveId($warehouse), $warehouse, $qty);
    }

    /** Increment the balance of a known warehouse row (no name lookup, so a rename cannot split it). */
    public function addTo(StockItem $item, Warehouse $warehouse, int $qty): void
    {
        $this->increment($item, $warehouse->id, $qty);
    }

    /** Decrement the balance of a known warehouse row, rejecting an over-draw. */
    public function removeFrom(StockItem $item, Warehouse $warehouse, int $qty): void
    {
        $this->decrement($item, $warehouse->id, $warehouse->name, $qty);
    }

    private function increment(StockItem $item, ?int $warehouseId, int $qty): void
    {
        if ($qty <= 0) {
            return;
        }
        $balance = StockBalance::lockForUpdate()->firstOrCreate(
            ['stock_item_id' => $item->id, 'warehouse_id' => $warehouseId],
            ['qty' => 0],
        );
        $balance->qty += $qty;
        $balance->save();
    }

    private function decrement(StockItem $item, ?int $warehouseId, string $warehouseName, int $qty): void
    {
        if ($qty <= 0) {
            return;
        }
        $balance = StockBalance::lockForUpdate()
            ->where(['stock_item_id' => $item->id, 'warehouse_id' => $warehouseId])
            ->first();
        $available = (int) ($balance->qty ?? 0);
        if ($available < $qty) {
            Refusal::fail('not_enough_stock_in_warehouse', ['warehouse' => $warehouseName, 'available' => $available], 'qty');
        }
        $balance->qty -= $qty;
        $balance->save();
    }

    /** Move qty between two warehouses for one item. */
    public function move(StockItem $item, string $from, string $to, int $qty): void
    {
        if ($from === $to) {
            Refusal::fail('same_warehouse', field: 'to_label');
        }
        $this->remove($item, $from, $qty);
        $this->add($item, $to, $qty);
    }

    /** Backfill: collapse an item's current_stock into a single 'Unassigned'
     *  balance row. SKUs no longer carry a home warehouse, so stock with no known
     *  location parks under 'Unassigned' until a movement places it. */
    public function rebuildFor(StockItem $item): void
    {
        StockBalance::updateOrCreate(
            ['stock_item_id' => $item->id, 'warehouse_id' => null],
            ['qty' => $item->current_stock],
        );
    }
}
