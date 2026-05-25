<?php

namespace App\Http\Requests;

use App\Enums\ContractType;
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
            'vendor' => ['required', 'string', 'max:255'],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::enum(ContractType::class)],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'value' => ['required', 'numeric', 'min:0'],
            'billing_cycle' => ['required', Rule::in(['monthly', 'quarterly', 'yearly'])],
            'auto_renew' => ['sometimes', 'boolean'],
            'owner_id' => ['nullable', 'integer', 'exists:employees,id'],
            'notify_150' => ['sometimes', 'boolean'],
            'notify_120' => ['sometimes', 'boolean'],
            'notify_60' => ['sometimes', 'boolean'],
            'notify_45' => ['sometimes', 'boolean'],
            'notify_30' => ['sometimes', 'boolean'],
            'notify_7' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
