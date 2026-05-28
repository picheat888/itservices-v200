<?php

namespace App\Http\Resources;

use App\Models\StockRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin StockRequest
 */
class StockRequestResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'stock_item_id' => $this->stock_item_id,
            'sku' => $this->whenLoaded('item', fn () => $this->item?->sku),
            'item_name' => $this->whenLoaded('item', fn () => $this->item?->name),
            'requester_name' => $this->requester_name,
            'dept' => $this->dept,
            'qty' => $this->qty,
            'reason' => $this->reason,
            'status' => $this->status,
            'approver_name' => $this->approver_name,
            'approved_at' => $this->approved_at?->toDateTimeString(),
            'fulfilled_at' => $this->fulfilled_at?->toDateTimeString(),
            'rejected_at' => $this->rejected_at?->toDateTimeString(),
            'created_at' => $this->created_at?->toDateTimeString(),
        ];
    }
}
