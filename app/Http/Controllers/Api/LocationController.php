<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Location;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LocationController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => Location::orderBy('name')->get(['id', 'name'])]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate(['name' => ['required', 'string', 'max:120']]);
        $location = Location::create($data);
        AuditLog::record('Created location', $location->name);

        return response()->json(['data' => $location, 'message' => 'success'], 201);
    }

    public function update(Request $request, Location $location): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate(['name' => ['required', 'string', 'max:120']]);
        $location->update($data);
        AuditLog::record('Updated location', $location->name);

        return response()->json(['data' => $location, 'message' => 'success']);
    }

    public function destroy(Request $request, Location $location): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        AuditLog::record('Deleted location', $location->name);
        $location->delete();

        return response()->json(['message' => 'success']);
    }
}
