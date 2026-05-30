<?php

namespace App\Services;

use App\Models\StockItem;
use App\Models\StockLot;
use Illuminate\Support\Carbon;

/**
 * FIFO lot costing. Every inbound movement opens a lot; outbound movements draw
 * down the oldest open lots first. Stock value is the sum of the remaining
 * quantity in each open lot times its unit cost.
 */
class StockLotService
{
    /**
     * Open a new lot for received stock. When no unit cost is given (returns,
     * positive count adjustments) it falls back to the item's current average
     * cost so valuation stays continuous.
     */
    public function addLot(StockItem $item, int $qty, ?float $unitCost, ?int $movementId, ?Carbon $receivedAt = null): void
    {
        if ($qty <= 0) {
            return;
        }

        StockLot::create([
            'stock_item_id' => $item->id,
            'stock_movement_id' => $movementId,
            'unit_cost' => $unitCost ?? $item->avgCost(),
            'qty_received' => $qty,
            'qty_remaining' => $qty,
            'received_at' => $receivedAt ?? now(),
        ]);
    }

    /** Draw down `qty` units from the oldest open lots first (FIFO). */
    public function consume(StockItem $item, int $qty): void
    {
        $remaining = $qty;

        $lots = StockLot::where('stock_item_id', $item->id)
            ->where('qty_remaining', '>', 0)
            ->orderBy('received_at')
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        foreach ($lots as $lot) {
            if ($remaining <= 0) {
                break;
            }
            $take = min($lot->qty_remaining, $remaining);
            $lot->qty_remaining -= $take;
            $lot->save();
            $remaining -= $take;
        }
    }

    /**
     * Align open lots with a target on-hand quantity (used after a stock count
     * commit): open a fallback-cost lot when short, consume FIFO when over.
     */
    public function reconcile(StockItem $item, int $targetQty): void
    {
        $current = (int) StockLot::where('stock_item_id', $item->id)->sum('qty_remaining');

        if ($targetQty > $current) {
            $this->addLot($item, $targetQty - $current, null, null);
        } elseif ($targetQty < $current) {
            $this->consume($item, $current - $targetQty);
        }
    }
}
