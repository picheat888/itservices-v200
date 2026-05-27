<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WarehouseController extends Controller
{
    /** List all warehouses ordered by name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => Warehouse::orderBy('name')->get()]);
    }

    /** Create a new warehouse. */
    public function store(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:warehouses,name'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $warehouse = Warehouse::create($data);
        AuditLog::record('Created warehouse', $warehouse->name);

        return response()->json(['data' => $warehouse, 'message' => 'success'], 201);
    }

    /** Update an existing warehouse. */
    public function update(Request $request, Warehouse $warehouse): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:warehouses,name,'.$warehouse->id],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $warehouse->update($data);
        AuditLog::record('Updated warehouse', $warehouse->name);

        return response()->json(['data' => $warehouse, 'message' => 'success']);
    }

    /** Delete a warehouse. */
    public function destroy(Request $request, Warehouse $warehouse): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        AuditLog::record('Deleted warehouse', $warehouse->name);
        $warehouse->delete();

        return response()->json(['message' => 'success']);
    }
}
