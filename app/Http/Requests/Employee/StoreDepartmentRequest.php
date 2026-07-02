<?php

namespace App\Http\Requests\Employee;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreDepartmentRequest extends FormRequest
{
    /**
     * Store requires employees.department_add; update requires employees.department_edit.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }
        $permission = $this->route('department') ? 'employees.department_edit' : 'employees.department_add';

        return (bool) $user->hasPermission($permission);
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
