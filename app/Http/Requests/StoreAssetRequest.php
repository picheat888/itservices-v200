<?php

namespace App\Http\Requests;

use App\Enums\AssetSource;
use App\Enums\AssetStatus;
use App\Enums\AssetType;
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
            'type' => ['required', Rule::enum(AssetType::class)],
            'brand' => ['nullable', 'string', 'max:120'],
            'model' => ['required', 'string', 'max:200'],
            'serial' => ['nullable', 'string', 'max:120'],
            'source' => ['required', Rule::enum(AssetSource::class)],
            'status' => ['sometimes', Rule::enum(AssetStatus::class)],
            'owner' => ['nullable', 'string', 'max:200'],
            'initial_owner' => ['nullable', 'string', 'max:200'],
            'department' => ['nullable', 'string', 'max:120'],
            'location' => ['nullable', 'string', 'max:200'],
            'value' => ['required', 'numeric', 'min:0'],
            'supplier' => ['nullable', 'string', 'max:200'],
            'purchase_date' => ['nullable', 'date'],
            'warranty_end' => ['nullable', 'date'],
            'contract_id' => ['nullable', 'integer', 'exists:contracts,id'],
            'lease_start' => ['nullable', 'date'],
            'lease_end' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
