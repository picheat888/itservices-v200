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
            'category' => $this->category,
            'brand' => $this->brand,
            'model' => $this->model,
            'unit' => $this->unit,
            'cost' => (float) $this->cost,
            'current_stock' => $this->current_stock,
            'min_stock' => $this->min_stock,
            'max_stock' => $this->max_stock,
            'warehouse' => $this->warehouse,
            'supplier' => $this->supplier,
            'warranty' => $this->warranty,
            'last_move_at' => $this->last_move_at?->toDateString(),
            'days_since_move' => $this->daysSinceLastMove(),
            'status' => $this->status(),
            'total_value' => (float) $this->cost * $this->current_stock,
        ];
    }
}
