<?php

namespace App\Http\Controllers\Api\Permission;

use App\Http\Controllers\Controller;
use App\Http\Requests\Permission\DuplicateRoleRequest;
use App\Http\Requests\Permission\ManageRolesRequest;
use App\Http\Requests\Permission\StoreRoleRequest;
use App\Http\Requests\Permission\UpdateRoleRequest;
use App\Http\Resources\Permission\RoleResource;
use App\Services\Permission\RoleDuplicateService;
use App\Services\Permission\RoleService;
use Illuminate\Http\JsonResponse;

class RoleController extends Controller
{
    public function store(StoreRoleRequest $request, RoleService $roles): JsonResponse
    {
        $role = $roles->create($request->validated());

        return response()->json(['data' => new RoleResource($role), 'message' => 'success'], 201);
    }

    /** A new custom role with the source's saved permissions; members are not copied. */
    public function duplicate(DuplicateRoleRequest $request, RoleDuplicateService $service): JsonResponse
    {
        $role = $service->duplicate($request->sourceRole(), $request->validated('name'), $request->validated('color'), $request->user());

        return response()->json(['data' => new RoleResource($role), 'message' => 'success'], 201);
    }

    public function update(UpdateRoleRequest $request, RoleService $roles): JsonResponse
    {
        $role = $roles->update($request->editedRole(), $request->validated());

        return response()->json(['data' => new RoleResource($role), 'message' => 'success']);
    }

    public function destroy(ManageRolesRequest $request, string $key, RoleService $roles): JsonResponse
    {
        $roles->delete($key);

        return response()->json(['message' => 'success']);
    }
}
