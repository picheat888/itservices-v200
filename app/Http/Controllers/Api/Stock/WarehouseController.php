<?php

namespace App\Http\Controllers\Api\Stock;

use App\Http\Controllers\Controller;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Stock\StockBalance;
use App\Models\Stock\StockItemSerial;
use App\Models\Stock\Warehouse;
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
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:warehouses,name,'.$warehouse->id],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $before = $warehouse->getOriginal();
        $warehouse->update($data);
        AuditLog::record('Updated warehouse', $warehouse->name, AuditLog::changes($before, $warehouse));

        return response()->json(['data' => $warehouse, 'message' => 'success']);
    }

    /** Delete a warehouse — blocked (409) while any asset, serial, or stock balance references it. */
    public function destroy(Warehouse $warehouse): JsonResponse
    {
        $inUse = Asset::where('warehouse_id', $warehouse->id)->exists()
            || StockItemSerial::where('warehouse_id', $warehouse->id)->exists()
            || StockBalance::where('warehouse_id', $warehouse->id)->exists();
        if ($inUse) {
            return response()->json(['message' => 'in_use'], 409);
        }
        AuditLog::record('Deleted warehouse', $warehouse->name);
        $warehouse->delete();

        return response()->json(['message' => 'success']);
    }
}
