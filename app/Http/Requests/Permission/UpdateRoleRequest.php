<?php

// Renaming a Role Template: it must exist and not be a system role before its name and colour are validated.

namespace App\Http\Requests\Permission;

use App\Models\Permission\Role;
use App\Services\Permission\RoleService;

class UpdateRoleRequest extends StoreRoleRequest
{
    private ?Role $editedRole = null;

    public function authorize(): bool
    {
        if (! parent::authorize()) {
            return false;
        }

        $this->editedRole = app(RoleService::class)->editableRole((string) $this->route('key'));

        return true;
    }

    public function editedRole(): Role
    {
        return $this->editedRole;
    }
}
