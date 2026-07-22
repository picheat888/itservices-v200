<?php

namespace App\Http\Requests\Access;

use Illuminate\Foundation\Http\FormRequest;

class StoreSocialPlatformRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('access.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'url' => ['nullable', 'string', 'max:255'],
            'color' => ['nullable', 'string', 'max:20'],
            'policy' => ['nullable', 'string', 'max:500'],
            // Logo image (optional) — sent multipart; a spoofed PUT carries it on edit.
            'logo' => ['nullable', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048'],
            'remove_logo' => ['nullable', 'boolean'],
        ];
    }
}
