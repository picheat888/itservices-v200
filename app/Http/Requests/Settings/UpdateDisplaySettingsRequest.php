<?php

// Settings -> Display: the system-wide theme (route permission settings.system).

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;

class UpdateDisplaySettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'theme_accent' => ['sometimes', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'theme_density' => ['sometimes', 'in:compact,normal,cozy'],
            'theme_radius' => ['sometimes', 'integer', 'min:0', 'max:20'],
        ];
    }
}
