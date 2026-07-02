<?php

namespace App\Services\Stock;

use App\Models\Stock\StockBalance;
use App\Models\Stock\StockItem;
use Illuminate\Validation\ValidationException;

/**
 * Owns per-warehouse on-hand quantities (stock_balances). Callers run these inside
 * the movement transaction; current_stock (the cached total) is maintained by the
 * caller. Removals are guarded so a warehouse balance can never go negative.
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
            ['stock_item_id' => $item->id, 'warehouse' => $warehouse],
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
            ->where(['stock_item_id' => $item->id, 'warehouse' => $warehouse])
            ->first();
        $available = (int) ($balance->qty ?? 0);
        if ($available < $qty) {
            throw ValidationException::withMessages([
                'qty' => "Not enough stock in {$warehouse}: {$available} available.",
            ]);
        }
        $balance->qty -= $qty;
        $balance->save();
    }

    /** Move qty between two warehouses for one item. */
    public function move(StockItem $item, string $from, string $to, int $qty): void
    {
        if ($from === $to) {
            throw ValidationException::withMessages(['to_label' => 'Source and destination warehouse must differ.']);
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
            ['stock_item_id' => $item->id, 'warehouse' => 'Unassigned'],
            ['qty' => $item->current_stock],
        );
    }
}
