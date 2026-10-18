<?php

// A Role Template's name and colour, for creating, renaming or duplicating one.

namespace App\Http\Requests\Permission;

class StoreRoleRequest extends ManageRolesRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:60'],
            'color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ];
    }
}
