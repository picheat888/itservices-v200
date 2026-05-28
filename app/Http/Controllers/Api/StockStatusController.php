<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\StockStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StockStatusController extends Controller
{
    /** List all stock statuses ordered by name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => StockStatus::orderBy('name')->get()]);
    }

    /** Create a new stock status. */
    public function store(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:stock_statuses,name'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $status = StockStatus::create($data);
        AuditLog::record('Created stock status', $status->name);

        return response()->json(['data' => $status, 'message' => 'success'], 201);
    }

    /** Update an existing stock status. */
    public function update(Request $request, StockStatus $stockStatus): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:stock_statuses,name,'.$stockStatus->id],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $stockStatus->update($data);
        AuditLog::record('Updated stock status', $stockStatus->name);

        return response()->json(['data' => $stockStatus, 'message' => 'success']);
    }

    /** Delete a stock status. */
    public function destroy(Request $request, StockStatus $stockStatus): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        AuditLog::record('Deleted stock status', $stockStatus->name);
        $stockStatus->delete();

        return response()->json(['message' => 'success']);
    }
}
