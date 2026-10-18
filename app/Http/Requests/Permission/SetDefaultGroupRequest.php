<?php

// Choosing the Role Group new employees join, or none.

namespace App\Http\Requests\Permission;

use Illuminate\Validation\Rule;

class SetDefaultGroupRequest extends ManageGroupsRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'group_id' => ['nullable', Rule::exists('group_roles', 'id')],
        ];
    }
}
