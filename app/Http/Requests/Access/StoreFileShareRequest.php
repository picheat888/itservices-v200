<?php

namespace App\Http\Requests\Access;

use Illuminate\Foundation\Http\FormRequest;

class StoreFileShareRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('access.manage');
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'path' => ['required', 'string', 'max:255'],
            'department_id' => ['required', 'exists:departments,id'],
            // size 0 = unlimited (no unit needed); any other size requires a unit.
            'size' => ['required', 'integer', 'min:0'],
            'size_unit' => ['nullable', 'required_unless:size,0', 'in:KB,GB,TB,PB'],
            'description' => ['nullable', 'string', 'max:500'],
            // A file share must have an owner from creation (matches email groups).
            // Required on create; on edit the owner is changed via the members dialog (setOwner),
            // so the edit form doesn't send it.
            'owner_employee_id' => [$this->isMethod('post') ? 'required' : 'nullable', 'exists:employees,id'],
        ];
    }
}
