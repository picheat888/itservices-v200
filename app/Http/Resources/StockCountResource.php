<?php

namespace App\Http\Resources;

use App\Models\StockCount;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin StockCount */
class StockCountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'warehouse' => $this->warehouse,
            'category' => $this->category,
            'status' => $this->status?->value,
            'note' => $this->note,
            'counted_by' => $this->whenLoaded('countedBy', fn () => $this->countedBy?->name),
            'committed_at' => $this->committed_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'lines' => $this->whenLoaded('lines', fn () => $this->lines->map(fn ($l) => [
                'id' => $l->id,
                'stock_item_id' => $l->stock_item_id,
                'sku' => $l->item?->sku,
                'name' => $l->item?->name,
                'system_qty' => $l->system_qty,
                'counted_qty' => $l->counted_qty,
                'variance' => $l->variance(),
            ])),
            'line_count' => $this->whenLoaded('lines', fn () => $this->lines->count()),
            'counted_lines' => $this->whenLoaded('lines', fn () => $this->lines->whereNotNull('counted_qty')->count()),
        ];
    }
}
