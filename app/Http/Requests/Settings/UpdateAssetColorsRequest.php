<?php

// Settings -> Assets: the status badge colours (route permission settings.assets).

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;

class UpdateAssetColorsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'asset_status_colors' => ['required', 'array'],
            'asset_status_colors.*' => ['string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ];
    }
}
