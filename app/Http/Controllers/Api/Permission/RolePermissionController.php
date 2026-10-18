<?php

namespace App\Http\Controllers\Api\Permission;

use App\Http\Controllers\Controller;
use App\Http\Requests\Permission\ManageRolesRequest;
use App\Http\Requests\Permission\UpdateRolePermissionsRequest;
use App\Services\Permission\RoleMatrixService;
use App\Services\Permission\RolePermissionService;
use Illuminate\Http\JsonResponse;

class RolePermissionController extends Controller
{
    public function index(ManageRolesRequest $request, RoleMatrixService $matrix): JsonResponse
    {
        return response()->json(['data' => $matrix->matrix()]);
    }

    /** Saves the role's permission set, then answers with the whole matrix. */
    public function update(UpdateRolePermissionsRequest $request, RolePermissionService $service, RoleMatrixService $matrix): JsonResponse
    {
        $service->update($request->user(), $request->editedRole(), $request->validated('permissions'), $request->validated('version'));

        return $this->index($request, $matrix);
    }
}
