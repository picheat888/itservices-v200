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

    /**
     * The allow_special_position flag is a privileged toggle: changing it requires
     * employees.position_special. If the caller lacks that permission and the request
     * would change the stored value, abort with 403 (super bypasses via hasPermission).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function guardSpecialFlag(Request $request, array $data, ?Position $position = null): array
    {
        if (! array_key_exists('allow_special_position', $data)) {
            return $data;
        }
        $current = (bool) ($position?->allow_special_position ?? false);
        $requested = (bool) $data['allow_special_position'];
        if ($requested !== $current && ! $request->user()?->hasPermission('employees.position_special')) {
            abort(403, 'Changing the special-position flag requires the Special Position Control permission.');
        }

        return $data;
    }

    public function store(StorePositionRequest $request): JsonResponse
    {
        $data = $this->guardSpecialFlag($request, $request->validated());
        $position = Position::create($data);
        AuditLog::record('Created position', $position->title);

        return (new PositionResource($position))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function update(StorePositionRequest $request, Position $position): JsonResponse
    {
        $before = $position->getOriginal();
        $data = $this->guardSpecialFlag($request, $request->validated(), $position);
        $position->update($data);
        AuditLog::record('Updated position', $position->title, AuditLog::changes($before, $position));

        return (new PositionResource($position))->additional(['message' => 'success'])->response();
    }

    public function destroy(Request $request, Position $position): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('employees.position_delete'), 403);

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
