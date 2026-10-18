<?php

// The Role Templates matrix: the permission catalogue and every role with its keys, member and group counts, and version.

namespace App\Services\Permission;

use App\Enums\UserRole;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class RoleMatrixService
{
    /**
     * @return array{catalog: array<string, list<string>>, roles: Collection<int, array<string, mixed>>}
     */
    public function matrix(): array
    {
        // Single query: all granted permissions grouped by role_id
        $permsByRoleId = RolePermission::where('allowed', true)
            ->get(['role_id', 'permission'])
            ->groupBy('role_id')
            ->map(fn ($rows) => $rows->pluck('permission')->all());

        // Single query: member counts per role_id
        $memberCounts = User::select('role_id', DB::raw('count(*) as cnt'))
            ->whereNotNull('role_id')
            ->groupBy('role_id')
            ->pluck('cnt', 'role_id');

        // Single query: Role Group counts per role_id
        $groupCounts = GroupRole::select('role_id', DB::raw('count(*) as cnt'))
            ->whereNotNull('role_id')
            ->groupBy('role_id')
            ->pluck('cnt', 'role_id');

        $roles = Role::orderByDesc('is_system')->orderBy('name')->get()->map(function (Role $role) use ($permsByRoleId, $memberCounts, $groupCounts) {
            // super shows the whole catalogue
            $isSuper = UserRole::isSuperKey($role->key);
            $allowed = $isSuper
                ? Permissions::all()
                : ($permsByRoleId[$role->id] ?? []);

            return [
                'value' => $role->key,
                'label' => $role->name,
                'color' => $role->color,
                'is_super' => $isSuper,
                'is_system' => $role->is_system,
                'members' => (int) ($memberCounts[$role->id] ?? 0),
                'groups' => (int) ($groupCounts[$role->id] ?? 0),
                'permissions' => $allowed,
                'version' => Role::versionOf($permsByRoleId[$role->id] ?? []),
            ];
        });

        return [
            'catalog' => Permissions::catalog(),
            'roles' => $roles,
        ];
    }
}
