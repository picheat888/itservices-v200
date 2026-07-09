<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Settings\Vendor;
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
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:vendors,name'],
            'name_th' => ['required', 'string', 'max:120'],
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
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:vendors,name,'.$vendor->id],
            'name_th' => ['required', 'string', 'max:120'],
            'contact' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
        ]);
        $before = $vendor->getOriginal();
        $vendor->update($data);
        AuditLog::record('Updated vendor', $vendor->name, AuditLog::changes($before, $vendor));

        return response()->json(['data' => $vendor, 'message' => 'success']);
    }

    /** Delete a vendor — blocked (409) while any asset or contract still references it. */
    public function destroy(Vendor $vendor): JsonResponse
    {
        $count = Asset::where('vendor_id', $vendor->id)->count() + Contract::where('vendor_id', $vendor->id)->count();
        if ($count > 0) {
            return response()->json(['message' => 'in_use', 'count' => $count], 409);
        }
        AuditLog::record('Deleted vendor', $vendor->name);
        $vendor->delete();

        return response()->json(['message' => 'success']);
    }
}
