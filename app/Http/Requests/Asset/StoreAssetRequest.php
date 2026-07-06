<?php

namespace App\Http\Requests\Asset;

use App\Enums\Asset\AssetSource;
use App\Enums\Asset\AssetStatus;
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
            'tag' => ['nullable', 'string', 'max:60', Rule::unique('assets', 'tag')->ignore($assetId)],
            'nickname' => ['nullable', 'string', 'max:120'],
            // Asset type is a Master Data category (managed under Settings → Master Data).
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'model_id' => ['required', 'integer', 'exists:asset_models,id'],
            'serial' => ['nullable', 'string', 'max:120'],
            'source' => ['required', Rule::enum(AssetSource::class)],
            'status' => ['sometimes', Rule::enum(AssetStatus::class)],
            'owner' => ['nullable', 'string', 'max:200'],
            'initial_owner' => ['nullable', 'string', 'max:200'],
            'department' => ['nullable', 'string', 'max:120'],
            'location_id' => ['nullable', 'integer', 'exists:locations,id'],
            'warehouse' => ['nullable', 'string', 'max:120'],
            // Purchased assets carry their own price; rented assets derive value from the contract.
            'value' => ['nullable', 'required_if:source,purchased', 'numeric', 'min:0'],
            'vendor_id' => ['nullable', 'required_if:source,purchased', 'integer', 'exists:vendors,id'],
            'purchase_date' => ['nullable', 'date'],
            'warranty_end' => ['nullable', 'date'],
            'warranty_lifetime' => ['sometimes', 'boolean'],
            // A rented asset must be linked to the vendor contract it's billed under.
            'contract_id' => ['nullable', 'required_if:source,rented', 'integer', 'exists:contracts,id'],
            'lease_start' => ['nullable', 'date'],
            'lease_end' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
