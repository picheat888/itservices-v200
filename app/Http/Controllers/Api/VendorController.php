<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Vendor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VendorController extends Controller
{
    /** List all vendors ordered by name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => Vendor::orderBy('name')->get()]);
    }

    /** Create a new vendor. */
    public function store(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'contact' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
        ]);
        $vendor = Vendor::create($data);
        AuditLog::record('Created vendor', $vendor->name);

        return response()->json(['data' => $vendor, 'message' => 'success'], 201);
    }

    /** Update an existing vendor. */
    public function update(Request $request, Vendor $vendor): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'contact' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
        ]);
        $vendor->update($data);
        AuditLog::record('Updated vendor', $vendor->name);

        return response()->json(['data' => $vendor, 'message' => 'success']);
    }

    /** Delete a vendor. */
    public function destroy(Request $request, Vendor $vendor): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        AuditLog::record('Deleted vendor', $vendor->name);
        $vendor->delete();

        return response()->json(['message' => 'success']);
    }
}
