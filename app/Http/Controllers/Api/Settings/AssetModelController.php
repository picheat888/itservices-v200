<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Settings\AssetModel;
use App\Models\Stock\StockItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('asset_models', 'name')->where(fn ($q) => $q->where('brand_id', $request->input('brand_id')))],
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
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('asset_models', 'name')->where(fn ($q) => $q->where('brand_id', $request->input('brand_id')))->ignore($assetModel->id)],
            'brand_id' => ['nullable', 'exists:brands,id'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $before = $assetModel->getOriginal();
        $assetModel->update($data);
        $assetModel->load('brand');
        AuditLog::record('Updated asset model', $assetModel->name, AuditLog::changes($before, $assetModel));

        return response()->json(['data' => $assetModel, 'message' => 'success']);
    }

    /** Delete an asset model — blocked (409) while any asset or stock item still references it. */
    public function destroy(AssetModel $assetModel): JsonResponse
    {
        if (Asset::where('model_id', $assetModel->id)->exists() || StockItem::where('model_id', $assetModel->id)->exists()) {
            return response()->json(['message' => 'in_use'], 409);
        }
        AuditLog::record('Deleted asset model', $assetModel->name);
        $assetModel->delete();

        return response()->json(['message' => 'success']);
    }
}
