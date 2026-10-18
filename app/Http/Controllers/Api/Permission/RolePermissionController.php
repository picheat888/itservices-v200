<?php

namespace App\Http\Controllers\Api\Permission;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use App\Support\RoleKeys;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class RolePermissionController extends Controller
{
    /** Blocks a non-super caller from editing the role they use themselves. */
    private function guardOwnRole(Request $request, int $roleId): void
    {
        $caller = $request->user();
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
    private function guardGrantCeiling(Request $request, array $addedKeys): void
    {
        $caller = $request->user();
        if ($caller->isSuper() || array_diff($addedKeys, $caller->permissions()) === []) {
            return;
        }

        abort(response()->json([
            'message' => 'You can only grant permissions you hold yourself.',
            'code' => 'grant_ceiling',
        ], 403));
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.manage_roles'), 403);

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
            ];
        });

        return response()->json([
            'data' => [
                'catalog' => Permissions::catalog(),
                'roles' => $roles,
            ],
        ]);
    }

    public function update(Request $request, string $role): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.manage_roles'), 403);
        $roleModel = RoleKeys::find($role);
        abort_if($roleModel === null, 404);
        abort_if(UserRole::isSuperKey($roleModel->key), 422, 'Administrator permissions cannot be changed.');
        $roleId = $roleModel->id;
        $this->guardOwnRole($request, $roleId);

        $data = $request->validate([
            'permissions' => ['present', 'array'],
            'permissions.*' => [Rule::in(Permissions::all())],
        ]);

        $granted = Permissions::normalizeStock($data['permissions']);
        $granted = Permissions::normalizeSettings($granted);
        $granted = Permissions::normalizeEmployees($granted);
        $granted = Permissions::normalizeContracts($granted);
        $granted = Permissions::normalizeAssets($granted);
        $granted = Permissions::normalizeAccess($granted);
        $granted = Permissions::normalizeTickets($granted);
        $granted = Permissions::normalizeWorkflows($granted);
        $granted = Permissions::normalizeRequests($granted);
        $granted = Permissions::normalizeNotifications($granted);
        $granted = Permissions::normalizeReports($granted);
        $granted = Permissions::normalizeSystem($granted);

        DB::transaction(function () use ($request, $roleId, $granted) {
            $lockedRole = Role::whereKey($roleId)->lockForUpdate()->firstOrFail();

            // Current keys, for the ceiling and the audit diff
            $before = $lockedRole->allowedKeys();
            $added = array_values(array_diff($granted, $before));
            $this->guardGrantCeiling($request, $added);

            // Bulk upsert
            $grantedSet = array_flip($granted);
            $upsertRows = array_map(fn ($key) => [
                'role_id' => $roleId,
                'permission' => $key,
                'allowed' => isset($grantedSet[$key]),
            ], Permissions::all());

            RolePermission::upsert($upsertRows, ['role_id', 'permission'], ['allowed']);

            AuditLog::record(
                'Updated permissions',
                $lockedRole->name ?? $lockedRole->key,
                ['added' => $added, 'removed' => array_values(array_diff($before, $granted))],
            );
        });

        return $this->index($request);
    }
}
