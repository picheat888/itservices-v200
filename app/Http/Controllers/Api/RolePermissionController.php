<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class RolePermissionController extends Controller
{
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

        $roles = Role::orderByDesc('is_system')->orderBy('name')->get()->map(function (Role $role) use ($permsByRoleId, $memberCounts) {
            $allowed = $role->key === 'super'
                ? Permissions::all()
                : ($permsByRoleId[$role->id] ?? []);

            return [
                'value' => $role->key,
                'label' => $role->name,
                'color' => $role->color,
                'is_super' => $role->key === 'super',
                'is_system' => $role->is_system,
                'members' => (int) ($memberCounts[$role->id] ?? 0),
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
        abort_if($role === 'super', 422, 'Administrator Template permissions cannot be changed.');
        $roleId = Role::where('key', $role)->value('id');
        abort_if($roleId === null, 404);

        $data = $request->validate([
            'permissions' => ['present', 'array'],
            'permissions.*' => [Rule::in(Permissions::all())],
        ]);

        $granted = $data['permissions'];

        // Snapshot current permissions before overwriting to compute the diff.
        $before = RolePermission::where('role_id', $roleId)->where('allowed', true)->pluck('permission')->all();

        // Upsert in bulk instead of N individual updateOrCreate calls; write BOTH
        // role_id (new FK) and legacy role (still NOT NULL until dropped in a later task).
        $grantedSet = array_flip($granted);
        $upsertRows = array_map(fn ($key) => [
            'role_id' => $roleId,
            'role' => $role, // legacy column still NOT NULL until it is dropped in a later task
            'permission' => $key,
            'allowed' => isset($grantedSet[$key]),
        ], Permissions::all());

        RolePermission::upsert($upsertRows, ['role_id', 'permission'], ['allowed']);

        $added = array_values(array_diff($granted, $before));
        $removed = array_values(array_diff($before, $granted));

        AuditLog::record(
            'Updated permissions',
            Role::where('key', $role)->value('name') ?? $role,
            ['added' => $added, 'removed' => $removed],
        );

        return $this->index($request);
    }

    public function setDefaultRole(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.manage_roles'), 403);

        $data = $request->validate([
            'role' => ['required', 'string', Rule::exists('roles', 'key')],
        ]);

        AuditLog::record(
            'Set default employee role',
            Role::where('key', $data['role'])->value('name') ?? $data['role'],
        );

        return $this->index($request);
    }
}
