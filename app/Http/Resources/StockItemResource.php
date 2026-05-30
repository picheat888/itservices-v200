<?php

namespace App\Http\Resources;

use App\Models\StockItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin StockItem
 */
class StockItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'name' => $this->name,
            'serial' => $this->serial,
            'track_serial' => (bool) $this->track_serial,
            'category' => $this->category,
            'brand' => $this->brand,
            'model' => $this->model,
            'unit' => $this->unit,
            // Cost is the weighted-average of open FIFO lots (no longer a fixed SKU field).
            'cost' => $this->avgCost(),
            'current_stock' => $this->current_stock,
            'min_stock' => $this->min_stock,
            'max_stock' => $this->max_stock,
            'warehouse' => $this->warehouse,
            'supplier' => $this->supplier,
            'warranty' => $this->warranty,
            'last_move_at' => $this->last_move_at?->toDateString(),
            'days_since_move' => $this->daysSinceLastMove(),
            'status' => $this->status(),
            'total_value' => $this->stockValue(),
            // Per-unit serials are only attached when the relation is eager-loaded
            // (i.e. on the show endpoint), so list/summary payloads stay lean.
            'serials' => $this->whenLoaded('serials', fn () => $this->serials->map(fn ($s) => [
                'id' => $s->id,
                'serial' => $s->serial,
                'status' => $s->status,
                'warehouse' => $s->warehouse,
                'reference' => $s->reference,
                'received_at' => $s->received_at?->toDateTimeString(),
            ])),
            // FIFO cost lots (eager-loaded). `value` is the remaining-on-hand worth of the lot.
            'lots' => $this->whenLoaded('lots', fn () => $this->lots->map(fn ($l) => [
                'id' => $l->id,
                'unit_cost' => (float) $l->unit_cost,
                'qty_received' => $l->qty_received,
                'qty_remaining' => $l->qty_remaining,
                'value' => round($l->qty_remaining * (float) $l->unit_cost, 2),
                'received_at' => $l->received_at?->toDateTimeString(),
            ])),
        ];
    }
}
