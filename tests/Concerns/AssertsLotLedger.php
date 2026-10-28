<?php

namespace Tests\Concerns;

use App\Models\Stock\StockBalance;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockLotEntry;

// Lot invariants for stock tests: lots match the warehouse balances, and each lot matches its ledger entries.
trait AssertsLotLedger
{
    /** Per warehouse (null = its own bucket), Σ open lot qty_remaining equals stock_balances.qty. */
    protected function assertLotsMatchBalances(StockItem $item): void
    {
        $lots = StockLot::where('stock_item_id', $item->id)
            ->where('qty_remaining', '>', 0)
            ->get()
            ->groupBy(fn (StockLot $lot): string => (string) ($lot->warehouse_id ?? 'null'))
            ->map(fn ($group): int => (int) $group->sum('qty_remaining'))
            ->filter()
            ->sortKeys()
            ->all();

        $balances = StockBalance::where('stock_item_id', $item->id)
            ->get()
            ->groupBy(fn (StockBalance $balance): string => (string) ($balance->warehouse_id ?? 'null'))
            ->map(fn ($group): int => (int) $group->sum('qty'))
            ->filter()
            ->sortKeys()
            ->all();

        $this->assertSame($balances, $lots, "Lots of {$item->sku} do not match its warehouse balances (warehouse id => qty).");
    }

    /** Every lot's qty_remaining equals the sum of its ledger entries. */
    protected function assertLotsMatchEntries(StockItem $item): void
    {
        $lots = StockLot::where('stock_item_id', $item->id)->get();

        foreach ($lots as $lot) {
            $ledger = (int) StockLotEntry::where('stock_lot_id', $lot->id)->sum('qty');
            $this->assertSame($ledger, $lot->qty_remaining, "Lot {$lot->id} ({$lot->lot_no}) remaining does not match its entries.");
        }
    }
}
