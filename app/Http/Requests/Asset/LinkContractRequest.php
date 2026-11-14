<?php

// Link one or several rented assets that have no contract to one open hardware contract.

namespace App\Http\Requests\Asset;

use App\Enums\Contract\ContractType;
use Illuminate\Auth\Access\Response;
use Illuminate\Validation\Rule;

class LinkContractRequest extends AssetActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canEdit($this->user());
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            ...$this->idsRules(),
            'contract_id' => [
                'required',
                'integer',
                Rule::exists('contracts', 'id')
                    ->where('type', ContractType::Hardware->value)
                    ->whereNull('cancelled_at')
                    ->whereNull('expired_at'),
            ],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'contract_id.exists' => 'link_contract_not_open',
            'ids.*.exists' => 'link_asset_missing',
        ];
    }

    protected function passedValidation(): void
    {
        $this->guard()->canLinkContract($this->assets())->authorize();
    }
}
