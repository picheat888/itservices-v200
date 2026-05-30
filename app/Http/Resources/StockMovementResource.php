<?php

namespace App\Http\Resources;

use App\Models\StockMovement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin StockMovement
 */
class StockMovementResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'stock_item_id' => $this->stock_item_id,
            'sku' => $this->whenLoaded('item', fn () => $this->item?->sku),
            'item_name' => $this->whenLoaded('item', fn () => $this->item?->name),
            'qty' => $this->qty,
            'unit_cost' => $this->unit_cost !== null ? (float) $this->unit_cost : null,
            'from' => $this->from_label,
            'to' => $this->to_label,
            'reference' => $this->reference,
            'recorded_by' => $this->recorded_by,
            'notes' => $this->notes,
            'moved_at' => $this->moved_at?->toDateTimeString(),
        ];
    }
}
