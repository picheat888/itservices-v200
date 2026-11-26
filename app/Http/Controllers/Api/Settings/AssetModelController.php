<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Settings\AssetModel;
use App\Models\Stock\StockItem;
use App\Services\Settings\AssetModelPhotoService;
use App\Support\InUse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AssetModelController extends Controller
{
    public function __construct(private AssetModelPhotoService $photos) {}

    /** List all asset models with their brand, ordered by name. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => AssetModel::with('brand')->orderBy('name')->get()]);
    }

    /** Create a new asset model, with its photo when one is attached. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('asset_models', 'name')->where(fn ($q) => $q->where('brand_id', $request->input('brand_id')))],
            'brand_id' => ['nullable', 'exists:brands,id'],
            'description' => ['nullable', 'string', 'max:255'],
            ...$this->photoRules(),
        ]);
        $model = $this->photos->save(new AssetModel, $data, $request->file('photo'));
        $model->load('brand');
        AuditLog::record('Created asset model', $model->name, subject: $model);

        return response()->json(['data' => $model, 'message' => 'success'], 201);
    }

    /** Update an existing asset model; its photo changes only when a new one is attached or removal is asked for. */
    public function update(Request $request, AssetModel $assetModel): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('asset_models', 'name')->where(fn ($q) => $q->where('brand_id', $request->input('brand_id')))->ignore($assetModel->id)],
            'brand_id' => ['nullable', 'exists:brands,id'],
            'description' => ['nullable', 'string', 'max:255'],
            ...$this->photoRules(),
        ]);
        $before = $assetModel->getOriginal();
        $this->photos->save($assetModel, $data, $request->file('photo'));
        $assetModel->load('brand');
        AuditLog::record('Updated asset model', $assetModel->name, AuditLog::changes($before, $assetModel), subject: $assetModel);

        return response()->json(['data' => $assetModel, 'message' => 'success']);
    }

    /** Delete an asset model and its photo — blocked (409) while any asset or stock item still references it. */
    public function destroy(AssetModel $assetModel): JsonResponse
    {
        $refusal = InUse::refusal([
            Asset::where('model_id', $assetModel->id)->count(),
            StockItem::where('model_id', $assetModel->id)->count(),
        ]);
        if ($refusal) {
            return $refusal;
        }
        AuditLog::recordDeleted('Deleted asset model', $assetModel->name, $assetModel);
        $assetModel->delete();
        $this->photos->delete($assetModel->photo_path);

        return response()->json(['message' => 'success']);
    }

    /**
     * The photo arrives already cropped and shrunk by the browser, so 2MB is plenty.
     *
     * @return array<string, array<int, string>>
     */
    private function photoRules(): array
    {
        return [
            'photo' => ['nullable', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048'],
            'remove_photo' => ['sometimes', 'boolean'],
        ];
    }
}
