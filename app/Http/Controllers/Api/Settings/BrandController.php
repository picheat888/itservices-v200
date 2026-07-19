<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Models\Access\Software;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Settings\Brand;
use App\Models\Stock\StockItem;
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
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:brands,name,'.$brand->id],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $before = $brand->getOriginal();
        $brand->update($data);
        AuditLog::record('Updated brand', $brand->name, AuditLog::changes($before, $brand));

        return response()->json(['data' => $brand, 'message' => 'success']);
    }

    /** Delete a brand — blocked (409) while any asset or stock item still references it. */
    public function destroy(Brand $brand): JsonResponse
    {
        $count = Asset::where('brand_id', $brand->id)->count()
            + StockItem::where('brand_id', $brand->id)->count()
            + Software::where('brand_id', $brand->id)->count();
        if ($count > 0) {
            return response()->json(['message' => 'in_use', 'count' => $count], 409);
        }
        AuditLog::record('Deleted brand', $brand->name);
        $brand->delete();

        return response()->json(['message' => 'success']);
    }
}
