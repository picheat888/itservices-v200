<?php

// Settings -> Company: the company identity fields (route permission settings.company).

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCompanySettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'company_name' => ['sometimes', 'required', 'string', 'max:150'],
            'legal_name' => ['sometimes', 'required', 'string', 'max:150'],
            'tax_id' => ['sometimes', 'required', 'digits:13'],
            'industry' => ['sometimes', 'required', 'string', 'max:100'],
            'address' => ['sometimes', 'required', 'string', 'max:255'],
            'country' => ['sometimes', 'nullable', 'string', 'max:100'],
            'currency' => ['sometimes', 'nullable', 'string', 'max:20'],
        ];
    }
}
