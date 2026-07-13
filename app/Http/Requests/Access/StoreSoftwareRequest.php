<?php

namespace App\Http\Requests\Access;

use App\Enums\Access\SoftwareLicenseType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Enum;

class StoreSoftwareRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('access.manage');
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'publisher' => ['nullable', 'string', 'max:255'],
            'version' => ['nullable', 'string', 'max:100'],
            'license_type' => ['required', new Enum(SoftwareLicenseType::class)],
            'seats' => ['nullable', 'integer', 'min:0'],
            'department_id' => ['nullable', 'integer', Rule::exists('departments', 'id')],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
