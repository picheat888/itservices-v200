<?php

// Role Template create, rename and delete, each with its audit row; system roles and roles still in use are refused.

namespace App\Services\Permission;

use App\Models\AuditLog;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;

class RoleService
{
    public function findByKey(string $key): Role
    {
        return Role::where('key', $key)->firstOrFail();
    }

    /** The role behind the key, refused when it is a system role. */
    public function editableRole(string $key): Role
    {
        $role = $this->findByKey($key);
        abort_if($role->is_system, 422, 'System role cannot be edited.');

        return $role;
    }

    /**
     * @param  array{name: string, color?: string|null}  $data
     */
    public function create(array $data): Role
    {
        $role = Role::create([
            'key' => Role::uniqueKeyFor($data['name']),
            'name' => $data['name'],
            'color' => $data['color'] ?? '#64748b',
            'is_system' => false,
        ]);

        AuditLog::record('Created role', $role->name, subject: $role);

        return $role;
    }

    /**
     * @param  array{name: string, color?: string|null}  $data
     */
    public function update(Role $role, array $data): Role
    {
        $before = $role->getOriginal();
        $role->update($data);

        AuditLog::record('Updated role', $role->name, AuditLog::changes($before, $role), subject: $role);

        return $role;
    }

    public function delete(string $key): void
    {
        $role = $this->findByKey($key);
        abort_if($role->is_system, 422, 'System role cannot be deleted.');
        abort_if($role->members() > 0, 422, 'Role still has members. Reassign them first.');
        abort_if(GroupRole::where('role_id', $role->id)->exists(), 422, 'Role is still used by a Role Group. Reassign it first.');

        // role_permissions rows cascade-delete via the role_id FK.
        $name = $role->name;
        $role->delete();

        AuditLog::recordDeleted('Deleted role', $name, $role);
    }
}
