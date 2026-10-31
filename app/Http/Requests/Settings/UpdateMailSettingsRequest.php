<?php

// Settings -> Email: the SMTP settings; a password is required only when signing in for the first time (route permission settings.email).

namespace App\Http\Requests\Settings;

use App\Models\Settings\MailSetting;
use Illuminate\Foundation\Http\FormRequest;

class UpdateMailSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        // Once a password is stored, a blank one keeps it
        $needsPassword = filled($this->input('username')) && blank(MailSetting::current()->password);

        return [
            'host' => ['required', 'string', 'max:255'],
            'port' => ['required', 'integer', 'min:1', 'max:65535'],
            'username' => ['nullable', 'string', 'max:255'],
            'password' => [$needsPassword ? 'required' : 'nullable', 'string', 'max:255'],
            'encryption' => ['nullable', 'in:tls,ssl'],
            'from_address' => ['required', 'email', 'max:255'],
            'from_name' => ['required', 'string', 'max:255'],
        ];
    }
}
