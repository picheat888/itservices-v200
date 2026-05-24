<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\RolePermission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class RoleController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.manage_roles'), 403);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);

        $base = Str::slug($data['name'], '_') ?: 'role';
        $key = $base;
        $i = 1;
        while (Role::where('key', $key)->exists()) {
            $key = $base.'_'.$i++;
        }

        $role = Role::create([
            'key' => $key,
            'name' => $data['name'],
            'color' => $data['color'] ?? '#64748b',
            'is_system' => false,
        ]);

        AuditLog::record('Created role', $role->name);

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
        $role->update($data);

        AuditLog::record('Updated role', $role->name);

        return response()->json(['data' => $role, 'message' => 'success']);
    }

    public function destroy(Request $request, string $key): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('system.manage_roles'), 403);
        $role = Role::where('key', $key)->firstOrFail();
        abort_if($role->is_system, 422, 'System role cannot be deleted.');
        abort_if($role->members() > 0, 422, 'Role still has members. Reassign them first.');

        RolePermission::where('role', $key)->delete();
        $name = $role->name;
        $role->delete();

        AuditLog::record('Deleted role', $name);

        return response()->json(['message' => 'success']);
    }
}
