<?php

// Validates the import call: the kind, an optional open hardware contract (rented only) and the shape of the rows.

namespace App\Http\Requests\Asset;

use App\Enums\Contract\ContractType;
use App\Models\Contract\Contract;
use App\Support\AssetImportColumns;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AssetImportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('assets.register');
    }

    /** The chosen contract, or null when the rows wait for one. */
    public function contract(): ?Contract
    {
        return $this->filled('contract_id') ? Contract::find($this->integer('contract_id')) : null;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $isBool = fn (string $attribute, mixed $value, callable $fail) => $value === null || is_bool($value) || $fail('invalid');

        return [
            'kind' => ['required', Rule::in(AssetImportColumns::KINDS)],
            'contract_id' => [
                'nullable',
                Rule::prohibitedIf(fn () => $this->input('kind') !== 'rented'),
                'integer',
                Rule::exists('contracts', 'id')
                    ->where('type', ContractType::Hardware->value)
                    ->whereNull('cancelled_at')
                    ->whereNull('expired_at'),
            ],
            'rows' => ['required', 'array', 'min:1', 'max:500'],
            'rows.*' => ['array'],
            'rows.*.line' => ['required', 'integer'],
            'rows.*.category_id' => ['nullable', 'integer'],
            'rows.*.brand_id' => ['nullable', 'integer'],
            'rows.*.model_id' => ['nullable', 'integer'],
            'rows.*.warehouse_id' => ['nullable', 'integer'],
            'rows.*.vendor_id' => ['nullable', 'integer'],
            'rows.*.serial' => ['nullable', 'string'],
            'rows.*.asset_code' => ['nullable', 'string'],
            'rows.*.tag' => ['nullable', 'string'],
            'rows.*.notes' => ['nullable', 'string'],
            'rows.*.value' => ['nullable', 'numeric'],
            'rows.*.purchase_date' => ['nullable', 'date_format:Y-m-d'],
            'rows.*.warranty_end' => ['nullable', 'date_format:Y-m-d'],
            'rows.*.warranty_lifetime' => [$isBool],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['contract_id.exists' => 'link_contract_not_open'];
    }
}
