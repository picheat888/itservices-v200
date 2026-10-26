<?php

namespace App\Services\Stock;

use App\Enums\Stock\StockCountStatus;
use App\Models\Stock\StockCount;
use App\Models\Stock\StockCountLine;
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

    /**
     * Refuse a new count (422 count_overlap / count_overlap_many) when a draft count already holds
     * any of these items on an overlapping shelf: two drafts would book the same difference twice.
     *
     * @param  list<int>  $itemIds
     */
    public function assertNoOverlap(array $itemIds, ?int $warehouseId): void
    {
        $held = $this->overlap($itemIds, $warehouseId);
        if ($held === null) {
            return;
        }

        $details = ['sku' => $held['sku'], 'reference' => $held['reference']];
        $held['items'] === 1
            ? Refusal::fail('count_overlap', $details)
            : Refusal::fail('count_overlap_many', [...$details, 'n' => $held['items'] - 1]);
    }

    /**
     * The draft counts other than $exceptCountId holding any of these items on an overlapping shelf:
     * the same warehouse, or either count covers every warehouse (a null warehouse id).
     *
     * @param  list<int>  $itemIds
     * @return array{reference: string, sku: string, items: int}|null the oldest such count, the first held SKU and how many items are held
     */
    public function overlap(array $itemIds, ?int $warehouseId, ?int $exceptCountId = null): ?array
    {
        $lines = StockCountLine::query()
            ->whereIn('stock_item_id', $itemIds)
            ->whereHas('count', fn (Builder $count) => $count
                ->where('status', StockCountStatus::Draft->value)
                ->when($exceptCountId !== null, fn (Builder $q) => $q->whereKeyNot($exceptCountId))
                ->when($warehouseId !== null, fn (Builder $q) => $q->where(fn (Builder $w) => $w->whereNull('warehouse_id')->orWhere('warehouse_id', $warehouseId))))
            ->with(['count:id,reference', 'item:id,sku'])
            ->orderBy('stock_count_id')
            ->get();

        if ($lines->isEmpty()) {
            return null;
        }

        return [
            'reference' => $lines->first()->count->reference,
            'sku' => (string) $lines->map(fn (StockCountLine $line) => $line->item?->sku)->filter()->sort()->first(),
            'items' => $lines->pluck('stock_item_id')->unique()->count(),
        ];
    }
}
