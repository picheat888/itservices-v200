<?php

namespace App\Http\Resources\Stock;

use App\Models\Stock\StockItem;
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
            'warranty' => $this->warranty,
            'last_move_at' => $this->last_move_at?->toDateString(),
            'days_since_move' => $this->daysSinceLastMove(),
            'status' => $this->status(),
            'total_value' => $this->stockValue(),
            // Qty committed by approved-but-unfulfilled requests (present on the list
            // endpoint via withSum). available-to-request = current_stock − reserved.
            'reserved' => (int) ($this->reserved_qty ?? 0),
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
            // Per-warehouse balances (eager-loaded on show). Used in the detail modal.
            'balances' => $this->whenLoaded('balances', fn () => $this->balances->map(fn ($b) => [
                'warehouse' => $b->warehouse,
                'qty' => $b->qty,
            ])->values()),
            // FIFO cost lots (eager-loaded). `value` is the remaining-on-hand worth of the lot.
            'lots' => $this->whenLoaded('lots', fn () => $this->lots->map(fn ($l) => [
                'id' => $l->id,
                'unit_cost' => (float) $l->unit_cost,
                'qty_received' => $l->qty_received,
                'qty_remaining' => $l->qty_remaining,
                'value' => round($l->qty_remaining * (float) $l->unit_cost, 2),
                'received_at' => $l->received_at?->toDateTimeString(),
                // Receive-movement details for the per-lot drill-down (null for
                // seeded lots that were created without a movement).
                'doc_no' => $l->movement?->doc_no,
                'reference' => $l->movement?->reference,
                'warehouse' => $l->movement?->to_label,
                'supplier' => $l->movement?->from_label,
                'recorded_by' => $l->movement?->recorded_by,
                'notes' => $l->movement?->notes,
            ])),
        ];
    }
}
