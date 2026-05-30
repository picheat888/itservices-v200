<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreStockItemRequest extends FormRequest
{
    /**
     * Only super admins or holders of stock.manage_items may create/update items.
     */
    public function authorize(): bool
    {
        $user = $this->user();

        return (bool) ($user?->isSuper() || $user?->hasPermission('stock.manage_items'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $itemId = $this->route('stock_item')?->id;

        return [
            'sku' => ['required', 'string', 'max:60', Rule::unique('stock_items', 'sku')->ignore($itemId)],
            'name' => ['required', 'string', 'max:200'],
            'serial' => ['nullable', 'string', 'max:120'],
            'track_serial' => ['boolean'],
            'category' => ['nullable', 'string', 'max:120'],
            'brand' => ['nullable', 'string', 'max:120'],
            'model' => ['nullable', 'string', 'max:120'],
            'unit' => ['required', 'string', 'max:40'],
            // current_stock and cost are no longer set on the SKU — stock arrives
            // via Receive (per-lot cost), and value is derived from FIFO lots.
            'min_stock' => ['required', 'integer', 'min:0'],
            'max_stock' => ['required', 'integer', 'min:0'],
            'warehouse' => ['nullable', 'string', 'max:120'],
            'supplier' => ['nullable', 'string', 'max:200'],
            'warranty' => ['nullable', 'string', 'max:120'],
        ];
    }
}
