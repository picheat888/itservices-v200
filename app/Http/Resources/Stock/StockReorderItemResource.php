<?php

namespace App\Http\Resources\Stock;

use App\Models\Stock\StockItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

// Slim stock row for the Overview reorder list (what that list renders, nothing more).

/** @mixin StockItem */
class StockReorderItemResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'name' => $this->name,
            'current_stock' => $this->current_stock,
            'min_stock' => $this->min_stock,
            'max_stock' => $this->max_stock,
            'balances' => $this->balances->map(fn ($b) => [
                'warehouse' => $b->warehouse?->name ?? 'Unassigned',
                'qty' => $b->qty,
            ])->values(),
        ];
    }
}
