<?php

// Saving a role's permission set: which roles may be edited, the hierarchy rules, the version check,
// the grant ceiling, one bulk upsert and the audit row.

namespace App\Services\Permission;

use App\Enums\UserRole;
use App\Models\AuditLog;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\GrantCeiling;
use App\Support\Permissions;
use App\Support\RoleKeys;
use Illuminate\Support\Facades\DB;

class RolePermissionService
{
    /** The role behind an exact key, refused when it is missing, Administrator, or a non-super caller's own. */
    public function editableRole(User $caller, string $key): Role
    {
        $role = RoleKeys::find($key);
        abort_if($role === null, 404);
        abort_if(UserRole::isSuperKey($role->key), 422, 'Administrator permissions cannot be changed.');
        $this->guardOwnRole($caller, $role->id);

        return $role;
    }

    /**
     * @param  array<int, string>  $permissions  validated keys
     * @param  string  $version  the version the editor loaded
     */
    public function update(User $caller, Role $role, array $permissions, string $version): void
    {
        $roleId = $role->id;
        $granted = Permissions::normalize($permissions);

        DB::transaction(function () use ($caller, $roleId, $granted, $version) {
            $lockedRole = Role::whereKey($roleId)->lockForUpdate()->firstOrFail();

            // Current keys, for the version check, the ceiling and the audit diff
            $before = $lockedRole->allowedKeys();
            $this->guardVersion($before, $version);
            $added = array_values(array_diff($granted, $before));
            $removed = array_values(array_diff($before, $granted));
            $this->guardGrantCeiling($caller, $added);

            // Bulk upsert
            $grantedSet = array_flip($granted);
            $upsertRows = array_map(fn ($key) => [
                'role_id' => $roleId,
                'permission' => $key,
                'allowed' => isset($grantedSet[$key]),
            ], Permissions::all());

            RolePermission::upsert($upsertRows, ['role_id', 'permission'], ['allowed']);

            if ($added !== [] || $removed !== []) {
                AuditLog::record(
                    'Updated permissions',
                    $lockedRole->name ?? $lockedRole->key,
                    ['added' => $added, 'removed' => $removed],
                    subject: $lockedRole,
                );
            }
        });
    }

    /** Blocks a non-super caller from editing the role they use themselves. */
    private function guardOwnRole(User $caller, int $roleId): void
    {
        if ($caller->isSuper() || (int) $caller->role_id !== $roleId) {
            return;
        }

        abort(response()->json([
            'message' => 'You cannot change the permissions of your own role.',
            'code' => 'own_access',
        ], 403));
    }

    /**
     * Blocks a non-super caller from granting a key they do not hold.
     *
     * @param  array<int, string>  $addedKeys
     */
    private function guardGrantCeiling(User $caller, array $addedKeys): void
    {
        if ($caller->isSuper() || array_diff($addedKeys, $caller->permissions()) === []) {
            return;
        }

        GrantCeiling::refuse();
    }

    /**
     * Refuses a save made from an older copy of the role's permissions.
     *
     * @param  array<int, string>  $storedKeys  read under the role's row lock
     */
    private function guardVersion(array $storedKeys, string $sentVersion): void
    {
        if (hash_equals(Role::versionOf($storedKeys), $sentVersion)) {
            return;
        }

        abort(response()->json([
            'message' => 'Someone else changed this role\'s permissions. Reload it and try again.',
            'code' => 'role_changed',
        ], 409));
    }
}
