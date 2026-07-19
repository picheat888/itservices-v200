<?php

namespace App\Http\Requests\Access;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreEmailGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->hasPermission('access.manage');
    }

    public function rules(): array
    {
        $id = $this->route('email_group')?->id;

        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('email_groups', 'email')->ignore($id)],
            'department_id' => ['required', 'exists:departments,id'],
            'description' => ['nullable', 'string', 'max:500'],
            // An email group must have an owner (the workflow approver) from creation.
            // Required on create; on edit the owner is changed via the members dialog (setOwner),
            // so the edit form doesn't send it.
            'owner_employee_id' => [$this->isMethod('post') ? 'required' : 'nullable', 'exists:employees,id'],
        ];
    }
}
