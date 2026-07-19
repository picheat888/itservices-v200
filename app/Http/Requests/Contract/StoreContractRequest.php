<?php

namespace App\Http\Requests\Contract;

use App\Enums\Contract\ContractType;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreContractRequest extends FormRequest
{
    /**
     * Creating requires contracts.create; editing requires contracts.edit.
     * Super Admin bypasses via hasPermission().
     */
    public function authorize(): bool
    {
        $permission = $this->isMethod('post') ? 'contracts.create' : 'contracts.edit';

        return (bool) $this->user()?->hasPermission($permission);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $contractId = $this->route('contract')?->id;

        return [
            'code' => ['required', 'string', 'max:50', Rule::unique('contracts', 'code')->ignore($contractId)],
            'vendor_id' => ['required', 'integer', 'exists:vendors,id'],
            'name' => ['required', 'string', 'max:255'],
            'details' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::enum(ContractType::class)],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'value' => ['required', 'numeric', 'min:0'],
            // Required when creating (admins set the whole-contract total up front,
            // with an on-screen estimate to check against); optional on edit so
            // legacy contracts without a total aren't blocked from other changes.
            'total_value' => [$this->isMethod('post') ? 'required' : 'nullable', 'numeric', 'min:0'],
            'billing_cycle' => ['required', Rule::in(['monthly', 'quarterly', 'yearly'])],
            'notify_150' => ['sometimes', 'boolean'],
            'notify_120' => ['sometimes', 'boolean'],
            'notify_90' => ['sometimes', 'boolean'],
            'notify_60' => ['sometimes', 'boolean'],
            'notify_45' => ['sometimes', 'boolean'],
            'notify_30' => ['sometimes', 'boolean'],
            'notify_7' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
            // Assets to link to this contract (sets each asset's contract_id). Omit to leave links
            // untouched. Only hardware contracts may hold assets — a non-empty list on any other
            // type is rejected (a hardware contract selecting none still sends [] to detach).
            'asset_ids' => ['sometimes', 'prohibited_unless:type,hardware', 'array'],
            'asset_ids.*' => ['integer', 'exists:assets,id'],
        ];
    }
}
