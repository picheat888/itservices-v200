<?php

namespace App\Services\Stock;

use App\Enums\Stock\StockCountStatus;
use App\Models\Stock\StockCount;
use App\Models\Stock\Warehouse;
use App\Support\Refusal;
use Illuminate\Database\Eloquent\Builder;

// Count freeze: an item in a draft stock count takes no movement on the shelf being counted, so the counted figure stays true.
class StockCountLock
{
    /**
     * Refuse (422 count_in_progress + the count's reference) when a draft count holds the item for
     * any of these warehouses: a one-warehouse count locks that warehouse, an all-warehouse count every one.
     *
     * @param  list<string|null>  $warehouses  the warehouse names the movement leaves or reaches
     */
    public function assertFree(int $stockItemId, array $warehouses): void
    {
        $ids = array_values(array_filter(array_map(fn (?string $name) => Warehouse::idOf($name), $warehouses)));

        $reference = StockCount::query()
            ->where('status', StockCountStatus::Draft->value)
            ->whereHas('lines', fn (Builder $line) => $line->where('stock_item_id', $stockItemId))
            ->where(fn (Builder $q) => $q->whereNull('warehouse_id')->when($ids !== [], fn (Builder $w) => $w->orWhereIn('warehouse_id', $ids)))
            ->orderBy('id')
            ->value('reference');

        if ($reference !== null) {
            Refusal::fail('count_in_progress', ['reference' => $reference]);
        }
    }
}
