<?php

// The 6-digit code a monitor TV shows, typed in Settings to pair it.

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;

class PairMonitorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'digits:6'],
        ];
    }
}
