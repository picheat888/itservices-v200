<?php

// Creating a Role Group: members come as a full employee_ids list or as add_ids / remove_ids, never both.

namespace App\Http\Requests\Permission;

use App\Support\RoleKeys;
use Illuminate\Validation\Rule;

class StoreGroupRoleRequest extends ManageGroupsRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'role' => $this->roleRules(),
            'employee_ids' => ['array', 'missing_with:add_ids,remove_ids'],
            'employee_ids.*' => ['exists:employees,id'],
            'add_ids' => ['array'],
            'add_ids.*' => ['exists:employees,id'],
            'remove_ids' => ['array'],
            'remove_ids.*' => ['integer'],
        ];
    }

    /**
     * @return list<mixed>
     */
    protected function roleRules(): array
    {
        return ['nullable', 'string', Rule::in(RoleKeys::all())];
    }
}
