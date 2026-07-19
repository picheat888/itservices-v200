<?php

namespace App\Http\Requests\Asset;

use App\Enums\Asset\AssetSource;
use App\Enums\Asset\AssetStatus;
use App\Enums\Contract\ContractType;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAssetRequest extends FormRequest
{
    /**
     * Registering a new asset requires assets.register; editing requires
     * assets.edit. Super Admin bypasses via hasPermission().
     */
    public function authorize(): bool
    {
        $permission = $this->isMethod('post') ? 'assets.register' : 'assets.edit';

        return (bool) $this->user()?->hasPermission($permission);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $assetId = $this->route('asset')?->id;

        return [
            // asset_code = the Asset code (auto-generated when blank); tag = the user nickname.
            'asset_code' => ['nullable', 'string', 'max:60', Rule::unique('assets', 'asset_code')->ignore($assetId)],
            'tag' => ['nullable', 'string', 'max:120'],
            // Asset type is a Master Data category (managed under Settings → Master Data).
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'model_id' => ['required', 'integer', 'exists:asset_models,id'],
            'serial' => ['nullable', 'string', 'max:120'],
            'source' => ['required', Rule::enum(AssetSource::class)],
            'status' => ['sometimes', Rule::enum(AssetStatus::class)],
            // Owner is either an employee code (linked to the FK) or a shared/common-use
            // label; the employee's name / department / position are read from the employee.
            'owner' => ['nullable', 'string', 'max:200'],
            'location_id' => ['nullable', 'integer', 'exists:locations,id'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            // Purchased assets carry their own price; rented assets derive value from the contract.
            'value' => ['nullable', 'required_if:source,purchased', 'numeric', 'min:0'],
            'vendor_id' => ['nullable', 'required_if:source,purchased', 'integer', 'exists:vendors,id'],
            'purchase_date' => ['nullable', 'date'],
            'warranty_end' => ['nullable', 'date'],
            'warranty_lifetime' => ['sometimes', 'boolean'],
            // A rented asset must be linked to the vendor contract it's billed under;
            // its lease term, fee and vendor are read from that contract (not stored here).
            // Only hardware contracts may hold assets, so the linked contract must be one.
            'contract_id' => [
                'nullable', 'required_if:source,rented', 'integer',
                Rule::exists('contracts', 'id')->where('type', ContractType::Hardware->value),
            ],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
