<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AssetModel;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AssetModelController extends Controller
{
    /** List all asset models with their brand, ordered by name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => AssetModel::with('brand')->orderBy('name')->get()]);
    }

    /** Create a new asset model. */
    public function store(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'brand_id' => ['nullable', 'exists:brands,id'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $model = AssetModel::create($data);
        $model->load('brand');
        AuditLog::record('Created asset model', $model->name);

        return response()->json(['data' => $model, 'message' => 'success'], 201);
    }

    /** Update an existing asset model. */
    public function update(Request $request, AssetModel $assetModel): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'brand_id' => ['nullable', 'exists:brands,id'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $before = $assetModel->getOriginal();
        $assetModel->update($data);
        $assetModel->load('brand');
        AuditLog::record('Updated asset model', $assetModel->name, AuditLog::changes($before, $assetModel));

        return response()->json(['data' => $assetModel, 'message' => 'success']);
    }

    /** Delete an asset model. */
    public function destroy(Request $request, AssetModel $assetModel): JsonResponse
    {
        abort_unless((bool) $request->user()?->isSuper(), 403);
        AuditLog::record('Deleted asset model', $assetModel->name);
        $assetModel->delete();

        return response()->json(['message' => 'success']);
    }
}
