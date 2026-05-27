<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Brand;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BrandController extends Controller
{
    /** List all brands ordered by name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => Brand::orderBy('name')->get()]);
    }

    /** Create a new brand. */
    public function store(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:brands,name'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $brand = Brand::create($data);
        AuditLog::record('Created brand', $brand->name);

        return response()->json(['data' => $brand, 'message' => 'success'], 201);
    }

    /** Update an existing brand. */
    public function update(Request $request, Brand $brand): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:brands,name,'.$brand->id],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $brand->update($data);
        AuditLog::record('Updated brand', $brand->name);

        return response()->json(['data' => $brand, 'message' => 'success']);
    }

    /** Delete a brand. */
    public function destroy(Request $request, Brand $brand): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        AuditLog::record('Deleted brand', $brand->name);
        $brand->delete();

        return response()->json(['message' => 'success']);
    }
}
