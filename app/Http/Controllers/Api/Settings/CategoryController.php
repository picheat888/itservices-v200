<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Settings\Category;
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
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $before = $category->getOriginal();
        $category->update($data);
        AuditLog::record('Updated category', $category->name, AuditLog::changes($before, $category));

        return response()->json(['data' => $category, 'message' => 'success']);
    }

    /** Delete a category. */
    public function destroy(Category $category): JsonResponse
    {
        AuditLog::record('Deleted category', $category->name);
        $category->delete();

        return response()->json(['message' => 'success']);
    }
}
