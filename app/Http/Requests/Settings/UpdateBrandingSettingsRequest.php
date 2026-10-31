<?php

// Settings -> Branding: the brand name and subtitle (route permission settings.system).

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;

class UpdateBrandingSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'brand_name' => ['sometimes', 'required', 'string', 'max:60'],
            'brand_sub' => ['sometimes', 'nullable', 'string', 'max:60'],
        ];
    }
}
