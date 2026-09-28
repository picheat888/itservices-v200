<?php

namespace App\Services\Stock;

use App\Models\Stock\StockBalance;
use App\Models\Stock\StockItem;
use App\Models\Stock\Warehouse;
use App\Support\Refusal;

/**
 * Owns per-warehouse on-hand quantities (stock_balances). Callers run these inside
 * the movement transaction; current_stock (the cached total) is maintained by the
 * caller. Removals are guarded so a warehouse balance can never go negative.
 *
 * The public API still speaks warehouse *names* (the movement flows pass names,
 * including the 'Unassigned' sentinel); each name is resolved to warehouse_id here.
 * 'Unassigned' / blank → null (no fake master row).
 */
class StockBalanceService
{
    /** Increment (or create) the balance for a warehouse. */
    public function add(StockItem $item, string $warehouse, int $qty): void
    {
        if ($qty <= 0) {
            return;
        }
        $balance = StockBalance::lockForUpdate()->firstOrCreate(
            ['stock_item_id' => $item->id, 'warehouse_id' => Warehouse::resolveId($warehouse)],
            ['qty' => 0],
        );
        $balance->qty += $qty;
        $balance->save();
    }

    /** Decrement the balance for a warehouse, rejecting an over-draw. */
    public function remove(StockItem $item, string $warehouse, int $qty): void
    {
        if ($qty <= 0) {
            return;
        }
        $balance = StockBalance::lockForUpdate()
            ->where(['stock_item_id' => $item->id, 'warehouse_id' => Warehouse::resolveId($warehouse)])
            ->first();
        $available = (int) ($balance->qty ?? 0);
        if ($available < $qty) {
            Refusal::fail('not_enough_stock_in_warehouse', ['warehouse' => $warehouse, 'available' => $available], 'qty');
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
