<?php

namespace App\Http\Requests\Access;

use App\Enums\Access\SoftwareLicenseType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Enum;

class StoreSoftwareRequest extends FormRequest
{
    /** Create requires software_add; editing an existing title requires software_edit. */
    public function authorize(): bool
    {
        $key = $this->route('software') !== null ? 'access.software_edit' : 'access.software_add';

        return (bool) $this->user()?->hasPermission($key);
    }

    /** Normalise an empty product key to null; the unlimited button stores seats as null. */
    protected function prepareForValidation(): void
    {
        $this->merge(['seats_unlimited' => $this->boolean('seats_unlimited')]);
        if ($this->boolean('seats_unlimited')) {
            $this->merge(['seats' => null]);
        }

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
            'seats' => [Rule::requiredIf(fn (): bool => ! $this->boolean('seats_unlimited')), 'nullable', 'integer', 'min:1'],
            'seats_unlimited' => ['boolean'],
            'product_key' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
            // Logo image (optional) — sent multipart; a spoofed PUT carries it on edit.
            'logo' => ['nullable', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048'],
            'remove_logo' => ['nullable', 'boolean'],
        ];
    }
}
