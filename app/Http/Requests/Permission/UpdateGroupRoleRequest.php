<?php

// Saving a Role Group: the same rules as creating one, and the role must be sent, even as null.

namespace App\Http\Requests\Permission;

class UpdateGroupRoleRequest extends StoreGroupRoleRequest
{
    /**
     * @return list<mixed>
     */
    protected function roleRules(): array
    {
        return ['present', ...parent::roleRules()];
    }
}
