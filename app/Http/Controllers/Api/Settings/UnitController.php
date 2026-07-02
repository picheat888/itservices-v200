<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Settings\Unit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UnitController extends Controller
{
    /** List all units ordered by name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => Unit::orderBy('name')->get()]);
    }

    /** Create a new unit. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:units,name'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $unit = Unit::create($data);
        AuditLog::record('Created unit', $unit->name);

        return response()->json(['data' => $unit, 'message' => 'success'], 201);
    }

    /** Update an existing unit. */
    public function update(Request $request, Unit $unit): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:units,name,'.$unit->id],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $before = $unit->getOriginal();
        $unit->update($data);
        AuditLog::record('Updated unit', $unit->name, AuditLog::changes($before, $unit));

        return response()->json(['data' => $unit, 'message' => 'success']);
    }

    /** Delete a unit. */
    public function destroy(Unit $unit): JsonResponse
    {
        AuditLog::record('Deleted unit', $unit->name);
        $unit->delete();

        return response()->json(['message' => 'success']);
    }
}
