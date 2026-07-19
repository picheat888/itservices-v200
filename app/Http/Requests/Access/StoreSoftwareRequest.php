<?php

namespace App\Http\Requests\Access;

use App\Enums\Access\SoftwareLicenseType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Enum;

class StoreSoftwareRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('access.manage');
    }

    /** Normalise an empty product key to null so an "off" key toggle clears it. */
    protected function prepareForValidation(): void
    {
        if ($this->has('product_key') && trim((string) $this->input('product_key')) === '') {
            $this->merge(['product_key' => null]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'license_type' => ['required', new Enum(SoftwareLicenseType::class)],
            'seats' => ['nullable', 'integer', 'min:0'],
            'product_key' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
            // Logo image (optional) — sent multipart; a spoofed PUT carries it on edit.
            'logo' => ['nullable', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048'],
            'remove_logo' => ['nullable', 'boolean'],
        ];
    }
}
