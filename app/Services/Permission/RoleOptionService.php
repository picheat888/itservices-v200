<?php

// The roles a Role Group can be given, with each role's allowed keys so the dialog can grey out roles above the caller's ceiling.

namespace App\Services\Permission;

use App\Enums\UserRole;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Support\Permissions;

class RoleOptionService
{
    /**
     * @return list<array{key: string, name: string|null, color: string|null, is_super: bool, permissions: list<string>}>
     */
    public function options(): array
    {
        $catalogue = Permissions::all();
        $allowedByRole = RolePermission::where('allowed', true)
            ->get(['role_id', 'permission'])
            ->groupBy('role_id')
            ->map(fn ($rows) => array_values(array_intersect($rows->pluck('permission')->all(), $catalogue)));

        return Role::orderByDesc('is_system')->orderBy('name')->get()
            ->map(function (Role $role) use ($allowedByRole, $catalogue) {
                $isSuper = UserRole::isSuperKey($role->key);

                return [
                    'key' => $role->key,
                    'name' => $role->name,
                    'color' => $role->color,
                    'is_super' => $isSuper,
                    'permissions' => $isSuper ? $catalogue : ($allowedByRole[$role->id] ?? []),
                ];
            })
            ->values()
            ->all();
    }
}
