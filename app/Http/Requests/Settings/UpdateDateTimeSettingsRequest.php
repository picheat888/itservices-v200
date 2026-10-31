<?php

// Settings -> System: how dates and times are written (route permission settings.system).

namespace App\Http\Requests\Settings;

use App\Support\DateDisplay;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateDateTimeSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'date_format' => ['required', Rule::in(DateDisplay::FORMATS)],
            'date_era' => ['required', Rule::in(DateDisplay::ERAS)],
            'time_format' => ['required', Rule::in(DateDisplay::TIMES)],
        ];
    }
}
