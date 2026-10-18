<?php

// Any Role Group endpoint: the caller must hold system.manage_groups.

namespace App\Http\Requests\Permission;

class ManageGroupsRequest extends GatedPermissionRequest
{
    protected function gate(): string
    {
        return 'system.manage_groups';
    }
}
