<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePositionRequest;
use App\Http\Resources\EmployeeResource;
use App\Http\Resources\PositionResource;
use App\Models\AuditLog;
use App\Models\Position;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PositionController extends Controller
{
    public function index(): JsonResponse
    {
        return PositionResource::collection(Position::withCount('employees')->orderBy('code')->get())->response();
    }

    /** Employees holding a position (for the "view members" dialog). */
    public function members(Position $position): JsonResponse
    {
        $members = $position->employees()->with(['department', 'position', 'section'])
            ->orderBy('first_name')->orderBy('last_name')->get();

        return EmployeeResource::collection($members)->response();
    }

    public function store(StorePositionRequest $request): JsonResponse
    {
        $position = Position::create($request->validated());
        AuditLog::record('Created position', $position->title);

        return (new PositionResource($position))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function update(StorePositionRequest $request, Position $position): JsonResponse
    {
        $before = $position->getOriginal();
        $position->update($request->validated());
        AuditLog::record('Updated position', $position->title, AuditLog::changes($before, $position));

        return (new PositionResource($position))->additional(['message' => 'success'])->response();
    }

    public function destroy(Request $request, Position $position): JsonResponse
    {
        abort_unless((bool) $request->user()?->canManageOrg(), 403);

        // A position can only be deleted once no employee holds it — the FK is
        // nullOnDelete, so deleting it would silently clear their position.
        if ($position->employees()->exists()) {
            return response()->json([
                'message' => 'position_has_employees',
                'employees_count' => $position->employees()->count(),
            ], 422);
        }

        AuditLog::record('Deleted position', $position->title);
        $position->delete();

        return response()->json(['message' => 'success']);
    }
}
