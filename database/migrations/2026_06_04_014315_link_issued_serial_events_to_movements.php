<?php

use App\Models\StockItemSerialEvent;
use App\Models\StockMovement;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Backfill: link historical 'issued' serial events to their issue movement.
     *
     * Older issues recorded serial events with only a `reference` (no stock_movement_id),
     * and that reference later drifted from the movement's — so the movement-detail dialog
     * showed an empty serial list. Re-link them by the attributes shared at issue time:
     * same item, same source warehouse (movement.from_label == event.warehouse), and the
     * same timestamp (movement.moved_at == event.occurred_at, both stamped in one request).
     *
     * Only links when that triple maps to exactly one issue movement, so split fulfillments
     * (one movement per warehouse, same reference) never cross-link.
     */
    public function up(): void
    {
        StockMovement::query()
            ->where('type', 'issue')
            ->whereNotNull('from_label')
            ->whereNotNull('moved_at')
            ->orderBy('id')
            ->each(function (StockMovement $movement): void {
                $siblings = StockMovement::query()
                    ->where('type', 'issue')
                    ->where('stock_item_id', $movement->stock_item_id)
                    ->where('from_label', $movement->from_label)
                    ->where('moved_at', $movement->moved_at)
                    ->count();

                if ($siblings !== 1) {
                    return; // ambiguous — leave for forward-linked data only
                }

                StockItemSerialEvent::query()
                    ->where('event', 'issued')
                    ->whereNull('stock_movement_id')
                    ->where('stock_item_id', $movement->stock_item_id)
                    ->where('warehouse', $movement->from_label)
                    ->where('occurred_at', $movement->moved_at)
                    ->update(['stock_movement_id' => $movement->id]);
            });
    }

    /**
     * Irreversible data backfill — un-linking would also drop links created natively
     * by new issues, so this is intentionally a no-op.
     */
    public function down(): void
    {
        //
    }
};
