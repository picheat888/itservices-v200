<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Settings\WarrantyType;
use App\Models\Stock\StockItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WarrantyTypeController extends Controller
{
    /** List all warranty types ordered by name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => WarrantyType::orderBy('name')->get()]);
    }

    /** Create a new warranty type. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:warranty_types,name'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $warrantyType = WarrantyType::create($data);
        AuditLog::record('Created warranty type', $warrantyType->name);

        return response()->json(['data' => $warrantyType, 'message' => 'success'], 201);
    }

    /** Update an existing warranty type. */
    public function update(Request $request, WarrantyType $warrantyType): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:warranty_types,name,'.$warrantyType->id],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $before = $warrantyType->getOriginal();
        $warrantyType->update($data);
        AuditLog::record('Updated warranty type', $warrantyType->name, AuditLog::changes($before, $warrantyType));

        return response()->json(['data' => $warrantyType, 'message' => 'success']);
    }

    /** Delete a warranty type — blocked (409) while any stock item still references it. */
    public function destroy(WarrantyType $warrantyType): JsonResponse
    {
        if (StockItem::where('warranty_type_id', $warrantyType->id)->exists()) {
            return response()->json(['message' => 'in_use'], 409);
        }
        AuditLog::record('Deleted warranty type', $warrantyType->name);
        $warrantyType->delete();

        return response()->json(['message' => 'success']);
    }
}
