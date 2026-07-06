<?php

namespace App\Http\Requests\Stock;

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
            // On create the SKU is generated server-side (see StockItem::nextSku),
            // so it is only validated when editing an existing item.
            'sku' => $itemId === null
                ? ['nullable']
                : ['required', 'string', 'max:60', Rule::unique('stock_items', 'sku')->ignore($itemId)],
            'name' => ['required', 'string', 'max:200'],
            'serial' => ['nullable', 'string', 'max:120'],
            'track_serial' => ['boolean'],
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'brand_id' => ['required', 'integer', 'exists:brands,id'],
            'model_id' => ['required', 'integer', 'exists:asset_models,id'],
            // Unit is optional (the form does not force it); warranty type is required.
            'unit_id' => ['nullable', 'integer', 'exists:units,id'],
            // current_stock and cost are no longer set on the SKU — stock arrives
            // via Receive (per-lot cost), and value is derived from FIFO lots.
            'min_stock' => ['required', 'integer', 'min:0'],
            'max_stock' => ['required', 'integer', 'min:0', 'gte:min_stock'],
            'warranty_type_id' => ['required', 'integer', 'exists:warranty_types,id'],
        ];
    }
}
