<?php

// Saving a role's permission set: the role must exist, not be Administrator and not be the caller's own,
// before the keys and the version are validated.

namespace App\Http\Requests\Permission;

use App\Models\Permission\Role;
use App\Services\Permission\RolePermissionService;
use App\Support\Permissions;
use Illuminate\Validation\Rule;

class UpdateRolePermissionsRequest extends ManageRolesRequest
{
    private ?Role $editedRole = null;

    public function authorize(): bool
    {
        if (! parent::authorize()) {
            return false;
        }

        $this->editedRole = app(RolePermissionService::class)->editableRole($this->user(), (string) $this->route('role'));

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'permissions' => ['present', 'array'],
            'permissions.*' => [Rule::in(Permissions::all())],
            'version' => ['required', 'string'],
        ];
    }

    public function editedRole(): Role
    {
        return $this->editedRole;
    }
}
