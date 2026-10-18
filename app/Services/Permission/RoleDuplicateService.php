<?php

// Copies a role template into a new custom role: the source's saved permissions only, never its members or super status.

namespace App\Services\Permission;

use App\Enums\UserRole;
use App\Models\AuditLog;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Support\Facades\DB;

class RoleDuplicateService
{
    public function duplicate(Role $source, string $name, ?string $color, User $caller): Role
    {
        // Administrator holds the whole catalogue without stored rows
        $keys = UserRole::isSuperKey($source->key) ? Permissions::all() : $source->allowedKeys();

        // The same ceiling as saving a role: grant only what you hold
        if (! $caller->isSuper() && array_diff($keys, $caller->permissions()) !== []) {
            abort(response()->json([
                'message' => 'You can only grant permissions you hold yourself.',
                'code' => 'grant_ceiling',
            ], 403));
        }

        return DB::transaction(function () use ($source, $name, $color, $keys) {
            $role = Role::create([
                'key' => Role::uniqueKeyFor($name),
                'name' => $name,
                'color' => $color ?? $source->color ?? '#64748b',
                'is_system' => false,
            ]);

            $granted = array_flip($keys);
            RolePermission::insert(array_map(fn (string $key) => [
                'role_id' => $role->id,
                'permission' => $key,
                'allowed' => isset($granted[$key]),
            ], Permissions::all()));

            AuditLog::record('Duplicated role', $role->name, ['from' => $source->name, 'permissions' => count($keys)], subject: $role);

            return $role;
        });
    }
}
