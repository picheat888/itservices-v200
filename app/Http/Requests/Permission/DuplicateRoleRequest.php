<?php

// Copying a Role Template: the source must exist before the new name and colour are validated.

namespace App\Http\Requests\Permission;

use App\Models\Permission\Role;
use App\Services\Permission\RoleService;

class DuplicateRoleRequest extends StoreRoleRequest
{
    private ?Role $sourceRole = null;

    public function authorize(): bool
    {
        if (! parent::authorize()) {
            return false;
        }

        $this->sourceRole = app(RoleService::class)->findByKey((string) $this->route('key'));

        return true;
    }

    public function sourceRole(): Role
    {
        return $this->sourceRole;
    }
}
