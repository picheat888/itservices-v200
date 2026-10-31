<?php

// Settings -> Sound: the notification sound and its system switch (route permission settings.sound).

namespace App\Http\Requests\Settings;

use App\Support\NotificationSounds;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSoundSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'sound' => ['required', Rule::in(NotificationSounds::KEYS)],
            'enabled' => ['required', 'boolean'],
        ];
    }
}
