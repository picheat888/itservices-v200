<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\Location;
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
        $data = $request->validate(['name' => ['required', 'string', 'max:120', 'unique:locations,name']]);
        $location = Location::create($data);
        AuditLog::record('Created location', $location->name, subject: $location);

        return response()->json(['data' => $location, 'message' => 'success'], 201);
    }

    public function update(Request $request, Location $location): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:locations,name,'.$location->id],
        ]);
        $before = $location->getOriginal();
        $location->update($data);
        AuditLog::record('Updated location', $location->name, AuditLog::changes($before, $location), subject: $location);

        return response()->json(['data' => $location, 'message' => 'success']);
    }

    /** Delete a location — blocked (409) while any asset or request still references it. */
    public function destroy(Location $location): JsonResponse
    {
        $count = Asset::where('location_id', $location->id)->count()
            + ServiceRequest::where('location_id', $location->id)->count();
        if ($count > 0) {
            return response()->json(['message' => 'in_use', 'count' => $count], 409);
        }
        AuditLog::recordDeleted('Deleted location', $location->name, $location);
        $location->delete();

        return response()->json(['message' => 'success']);
    }
}
