<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreDepartmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->canManageOrg();
    }

    /** Normalise tag to uppercase before validation so DB always stores consistent casing. */
    protected function prepareForValidation(): void
    {
        if ($this->filled('tag')) {
            $this->merge(['tag' => strtoupper($this->tag)]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $departmentId = $this->route('department')?->id;

        return [
            'name' => ['required', 'string', 'max:255'],
            'name_th' => ['nullable', 'string', 'max:255'],
            'tag' => ['nullable', 'string', 'max:50', Rule::unique('departments', 'tag')->ignore($departmentId)],
        ];
    }
}
