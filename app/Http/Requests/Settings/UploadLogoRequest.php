<?php

// Settings -> Branding: the logo file (route permission settings.system).

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;

class UploadLogoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // PNG only: the logo also goes into emails, where SVG does not render
            'logo' => ['required', 'file', 'mimes:png', 'max:2048'],
        ];
    }
}
