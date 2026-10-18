<?php

namespace App\Http\Controllers\Api\Permission;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Permission\GroupRole;
use App\Models\Permission\Role;
use App\Services\Permission\RoleDuplicateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.manage_roles'), 403);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);

        $role = Role::create([
            'key' => Role::uniqueKeyFor($data['name']),
            'name' => $data['name'],
            'color' => $data['color'] ?? '#64748b',
            'is_system' => false,
        ]);

        AuditLog::record('Created role', $role->name, subject: $role);

        return response()->json(['data' => $role, 'message' => 'success'], 201);
    }

    /** A new custom role with the source's saved permissions; members are not copied. */
    public function duplicate(Request $request, string $key, RoleDuplicateService $service): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.manage_roles'), 403);
        $source = Role::where('key', $key)->firstOrFail();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);

        $role = $service->duplicate($source, $data['name'], $data['color'] ?? null, $request->user());

        return response()->json(['data' => $role, 'message' => 'success'], 201);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.manage_roles'), 403);
        $role = Role::where('key', $key)->firstOrFail();
        abort_if($role->is_system, 422, 'System role cannot be edited.');

        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);

        $before = $role->getOriginal();
        $role->update($data);

        AuditLog::record('Updated role', $role->name, AuditLog::changes($before, $role), subject: $role);

        return response()->json(['data' => $role, 'message' => 'success']);
    }

    public function destroy(Request $request, string $key): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.manage_roles'), 403);
        $role = Role::where('key', $key)->firstOrFail();
        abort_if($role->is_system, 422, 'System role cannot be deleted.');
        abort_if($role->members() > 0, 422, 'Role still has members. Reassign them first.');
        abort_if(GroupRole::where('role_id', $role->id)->exists(), 422, 'Role is still used by a Role Group. Reassign it first.');

        // role_permissions rows cascade-delete via the role_id FK.
        $name = $role->name;
        $role->delete();

        AuditLog::recordDeleted('Deleted role', $name, $role);

        return response()->json(['message' => 'success']);
    }
}
