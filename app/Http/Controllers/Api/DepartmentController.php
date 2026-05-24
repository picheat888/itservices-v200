<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDepartmentRequest;
use App\Http\Resources\DepartmentResource;
use App\Http\Resources\EmployeeResource;
use App\Models\AuditLog;
use App\Models\Department;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DepartmentController extends Controller
{
    public function index(): JsonResponse
    {
        return DepartmentResource::collection(
            Department::withCount('employees')->orderBy('name')->get()
        )->response();
    }

    public function store(StoreDepartmentRequest $request): JsonResponse
    {
        $department = Department::create($request->validated());
        AuditLog::record('Created department', $department->name);

        return (new DepartmentResource($department))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function update(StoreDepartmentRequest $request, Department $department): JsonResponse
    {
        $department->update($request->validated());
        AuditLog::record('Updated department', $department->name);

        return (new DepartmentResource($department))->additional(['message' => 'success'])->response();
    }

    public function destroy(Request $request, Department $department): JsonResponse
    {
        abort_unless((bool) $request->user()?->canManageOrg(), 403);
        AuditLog::record('Deleted department', $department->name);
        $department->delete();

        return response()->json(['message' => 'success']);
    }

    // Members of a department (for the "view members" drawer).
    public function members(Department $department): JsonResponse
    {
        $members = $department->employees()->with(['department', 'position'])->orderBy('name')->get();

        return EmployeeResource::collection($members)->response();
    }
}
