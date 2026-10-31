<?php

// Recording a receive, return or transfer: the fields are checked first, then the right for that movement type (403).

namespace App\Http\Requests\Stock;

use App\Models\Stock\StockItem;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreStockMovementRequest extends FormRequest
{
    /** Permission per movement type; issuing only happens by fulfilling a request (StockRequestController). */
    public const TYPE_PERMISSION = [
        'receive' => 'stock.receive',
        'return' => 'stock.return',
        'transfer' => 'stock.transfer',
    ];

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        // Warehouse labels name an existing warehouse or the 'Unassigned' sentinel; a receive's from_label is the vendor
        $knownWarehouse = fn (string $field) => Rule::when(
            fn ($input) => $input->{$field} !== 'Unassigned' && ($field === 'to_label' || $input->type === 'transfer'),
            Rule::exists('warehouses', 'name'),
        );

        return [
            'type' => ['required', Rule::in(array_keys(self::TYPE_PERMISSION))],
            'stock_item_id' => ['required', 'integer', 'exists:stock_items,id'],
            // qty comes from serials (serialized receive), serial_ids (serialized return) or lots (return / transfer)
            'qty' => ['exclude_if:type,return', 'prohibited_if:type,transfer', 'required_without_all:serials,serial_ids,lot_ids', Rule::requiredIf(fn () => $this->input('type') === 'receive' && ! $this->isSerialItem($this->input('stock_item_id'))), 'nullable', 'integer', 'min:1', Rule::when($this->input('type') === 'receive', 'max:1000000')],
            'unit_cost' => ['nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999.99'],
            'from_label' => ['required_if:type,transfer', 'nullable', 'string', 'max:120', $knownWarehouse('from_label')],
            'to_label' => ['required_if:type,transfer', 'prohibited_if:type,return', 'nullable', 'string', 'max:120', $knownWarehouse('to_label')],
            'reference' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'moved_at' => ['nullable', 'date', 'before_or_equal:now'],
            'serials' => ['prohibited_if:type,transfer', 'array'],
            'serials.*' => ['nullable', 'string', 'max:120'],
            'serial_ids' => ['prohibited_if:type,transfer', 'array'],
            'serial_ids.*' => ['integer', 'exists:stock_item_serials,id'],
            // A transfer names the whole lots it moves
            'lot_ids' => ['required_if:type,transfer', 'exclude_unless:type,transfer', 'array', 'min:1'],
            'lot_ids.*' => ['integer', 'exists:stock_lots,id'],
            // A return names the fulfilled request and, for non-serial items, the lots it gives back to
            'stock_request_id' => ['required_if:type,return', 'exclude_unless:type,return', 'integer', 'exists:stock_requests,id'],
            'lots' => [Rule::requiredIf(fn () => $this->input('type') === 'return' && ! $this->isSerialItem($this->input('stock_item_id'))), 'exclude_unless:type,return', 'array'],
            'lots.*.lot_id' => ['required', 'integer', 'exists:stock_lots,id'],
            'lots.*.qty' => ['required', 'integer', 'min:1', 'max:1000000'],
        ];
    }

    /** The movement type's right, checked after the fields as before. */
    protected function passedValidation(): void
    {
        abort_unless((bool) $this->user()?->hasPermission(self::TYPE_PERMISSION[$this->validated('type')]), 403);
    }

    /** Whether the item tracks serials; feeds the qty and lots rules. */
    private function isSerialItem(mixed $stockItemId): bool
    {
        return is_numeric($stockItemId) && (bool) StockItem::whereKey((int) $stockItemId)->value('track_serial');
    }
}
