<?php

// Any Role Template endpoint: the caller must hold system.manage_roles.

namespace App\Http\Requests\Permission;

class ManageRolesRequest extends GatedPermissionRequest
{
    protected function gate(): string
    {
        return 'system.manage_roles';
    }
}
