<?php

namespace App\Http\Requests\Asset;

use App\Enums\Asset\AssetSource;
use App\Enums\Contract\ContractType;
use App\Models\Contract\Contract;
use App\Models\Settings\AssetModel;
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
            'tag' => ['nullable', 'string', 'max:10'],
            // Asset type is a Master Data category (managed under Settings → Master Data).
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'model_id' => ['required', 'integer', 'exists:asset_models,id', $this->modelOfTheBrandUnlessKept()],
            'serial' => ['nullable', 'string', 'max:120'],
            'source' => ['required', Rule::enum(AssetSource::class)],
            // No `status` / `owner`: custody changes only through the trail actions; unlisted keys are dropped.
            'location_id' => ['nullable', 'integer', 'exists:locations,id'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            // Purchased assets carry their own price; rented assets derive value from the contract.
            'value' => ['nullable', 'required_if:source,purchased', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999999.99'],
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
                $this->contractStillOpenUnlessKept(),
            ],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return ['tag' => 'Tag'];
    }

    /**
     * The model must belong to the chosen brand: one moved to another brand while the form was open is refused
     * as model_moved, which the form words "ยี่ห้อถูกเปลี่ยนเป็น … เลือกรุ่นใหม่". An edit that keeps the asset's
     * own brand and model saves as before.
     */
    private function modelOfTheBrandUnlessKept(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) {
            $brandId = $this->input('brand_id');
            if (blank($value) || blank($brandId)) {
                return;
            }
            $asset = $this->route('asset');
            if ($asset && (int) $value === (int) $asset->model_id && (int) $brandId === (int) $asset->brand_id) {
                return;
            }
            $modelBrand = AssetModel::whereKey($value)->value('brand_id');
            if ($modelBrand !== null && (int) $modelBrand !== (int) $brandId) {
                $fail('model_moved');
            }
        };
    }

    /** A cancelled or expired contract takes no new assets; an asset already on one may keep it. */
    private function contractStillOpenUnlessKept(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) {
            if (blank($value) || (int) $value === (int) $this->route('asset')?->contract_id) {
                return;
            }
            $closed = Contract::whereKey($value)
                ->where(fn ($q) => $q->whereNotNull('cancelled_at')->orWhereNotNull('expired_at'))
                ->exists();
            if ($closed) {
                $fail('contract_closed');
            }
        };
    }
}
