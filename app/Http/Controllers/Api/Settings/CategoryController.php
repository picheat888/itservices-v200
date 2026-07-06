<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Settings\Category;
use App\Models\Stock\StockItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    /** List all categories ordered by name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => Category::orderBy('name')->get()]);
    }

    /** Create a new category. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'name_th' => ['nullable', 'string', 'max:120'],
            'icon' => ['nullable', 'string', 'max:60'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $category = Category::create($data);
        AuditLog::record('Created category', $category->name);

        return response()->json(['data' => $category, 'message' => 'success'], 201);
    }

    /** Update an existing category. */
    public function update(Request $request, Category $category): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'name_th' => ['nullable', 'string', 'max:120'],
            'icon' => ['nullable', 'string', 'max:60'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $before = $category->getOriginal();
        $category->update($data);
        AuditLog::record('Updated category', $category->name, AuditLog::changes($before, $category));

        return response()->json(['data' => $category, 'message' => 'success']);
    }

    /** Delete a category — blocked (409) while any asset or stock item still references it. */
    public function destroy(Category $category): JsonResponse
    {
        if (Asset::where('category_id', $category->id)->exists() || StockItem::where('category_id', $category->id)->exists()) {
            return response()->json(['message' => 'in_use'], 409);
        }
        AuditLog::record('Deleted category', $category->name);
        $category->delete();

        return response()->json(['message' => 'success']);
    }
}
