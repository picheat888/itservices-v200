<?php

namespace App\Http\Controllers\Api;

use App\Enums\AssetStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAssetRequest;
use App\Http\Resources\AssetResource;
use App\Models\Asset;
use App\Models\AssetTransfer;
use App\Models\AuditLog;
use App\Services\AssetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AssetController extends Controller
{
    public function __construct(private readonly AssetService $service) {}

    /** Gate read access to the assets.view permission (super bypasses). */
    private function gateView(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.view'), 403);
    }

    /**
     * Paginated asset list with search (tag/model/owner/serial) and
     * type / source / status filters. Newest first.
     */
    public function index(Request $request): JsonResponse
    {
        $this->gateView($request);

        $query = Asset::query()->with('contract')->latest('id');

        if ($request->filled('search')) {
            $q = '%'.$request->query('search').'%';
            $query->where(function ($w) use ($q) {
                $w->where('tag', 'like', $q)
                    ->orWhere('model', 'like', $q)
                    ->orWhere('owner', 'like', $q)
                    ->orWhere('serial', 'like', $q);
            });
        }
        if ($request->filled('type')) {
            $query->where('type', $request->query('type'));
        }
        if ($request->filled('source')) {
            $query->where('source', $request->query('source'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));
        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => AssetResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    /**
     * Dashboard aggregates: status counts, total value, per-type breakdown,
     * and the highest-value assets.
     */
    public function summary(Request $request): JsonResponse
    {
        $this->gateView($request);

        $assets = Asset::all();

        $byType = $assets->groupBy(fn (Asset $a) => $a->type?->value)
            ->map(fn ($group, $type) => [
                'type' => $type,
                'count' => $group->count(),
            ])->sortByDesc('count')->values();

        $topValue = $assets->sortByDesc(fn (Asset $a) => $a->annualValue())->take(5)->values();

        return response()->json([
            'total' => $assets->count(),
            'deployed' => $assets->where('status', AssetStatus::Deployed)->count(),
            'ready' => $assets->where('status', AssetStatus::Ready)->count(),
            'pending_acceptance' => $assets->where('status', AssetStatus::PendingAcceptance)->count(),
            'pending_return' => $assets->where('status', AssetStatus::PendingReturn)->count(),
            'maintenance' => $assets->where('status', AssetStatus::Maintenance)->count(),
            'writeoff' => $assets->where('status', AssetStatus::Writeoff)->count(),
            'total_value' => round($assets->sum(fn (Asset $a) => $a->annualValue())),
            'by_type' => $byType,
            'top_value' => AssetResource::collection($topValue),
        ]);
    }

    /** Recent ownership-change history across all assets (newest first). */
    public function transfers(Request $request): JsonResponse
    {
        $this->gateView($request);

        $log = AssetTransfer::latest()->limit(100)->get()->map(fn (AssetTransfer $tr) => [
            'id' => $tr->id,
            'date' => $tr->created_at?->toDateString(),
            'asset_tag' => $tr->asset_tag,
            'asset_model' => $tr->asset_model,
            'from_owner' => $tr->from_owner,
            'to_owner' => $tr->to_owner,
            'reason' => $tr->reason,
            'performed_by' => $tr->performed_by,
        ]);

        return response()->json(['data' => $log]);
    }

    public function store(StoreAssetRequest $request): JsonResponse
    {
        $asset = $this->service->create($request->validated());
        AuditLog::record('Registered asset', "{$asset->tag} — {$asset->model}");

        return (new AssetResource($asset->load('contract')))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, Asset $asset): JsonResponse
    {
        $this->gateView($request);

        return (new AssetResource($asset->load('contract')))->response();
    }

    public function update(StoreAssetRequest $request, Asset $asset): JsonResponse
    {
        $before = $asset->getOriginal();
        $asset = $this->service->update($asset, $request->validated());
        AuditLog::record('Updated asset', "{$asset->tag} — {$asset->model}", AuditLog::changes($before, $asset));

        return (new AssetResource($asset->load('contract')))
            ->additional(['message' => 'success'])->response();
    }

    /** Delete an asset (requires assets.retire). */
    public function destroy(Request $request, Asset $asset): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.retire'), 403);
        AuditLog::record('Deleted asset', "{$asset->tag} — {$asset->model}");
        $asset->delete();

        return response()->json(['message' => 'success']);
    }

    /** Transfer an asset to a new owner (requires assets.transfer). */
    public function transfer(Request $request, Asset $asset): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.transfer'), 403);
        $data = $request->validate([
            'owner' => ['required', 'string', 'max:200'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);
        abort_if($asset->isDeployed(), 422, 'Asset is deployed — mark it returned first.');

        $asset = $this->service->transfer($asset, $data['owner'], $data['reason'] ?? null, $request->user()?->name);
        AuditLog::record('Transferred asset', "{$asset->tag} → {$data['owner']}");

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /** Recipient accepts a pending-acceptance asset (requires assets.transfer). */
    public function accept(Request $request, Asset $asset): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.transfer'), 403);
        $asset = $this->service->accept($asset);
        AuditLog::record('Accepted asset', $asset->tag);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /** Mark a returned asset as received back into the pool (requires assets.transfer). */
    public function markReceived(Request $request, Asset $asset): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.transfer'), 403);
        $asset = $this->service->markReceived($asset, $request->user()?->name);
        AuditLog::record('Received asset', $asset->tag);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /** Toggle an asset in/out of maintenance (requires assets.edit). */
    public function toggleMaintenance(Request $request, Asset $asset): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.edit'), 403);
        $asset = $this->service->toggleMaintenance($asset);
        AuditLog::record('Asset maintenance toggled', "{$asset->tag} → {$asset->status?->value}");

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /** Convert an asset into a stock item and mark it pending-stock (requires assets.retire). */
    public function toStock(Request $request, Asset $asset): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.retire'), 403);
        $data = $request->validate([
            'sku' => ['required', 'string', 'max:60', Rule::unique('stock_items', 'sku')],
            'warehouse' => ['nullable', 'string', 'max:120'],
            'qty' => ['required', 'integer', 'min:1'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $item = $this->service->convertToStock($asset, $data);
        AuditLog::record('Converted asset to stock', "{$asset->tag} → {$item->sku}");

        return (new AssetResource($asset->fresh()))->additional(['message' => 'success'])->response();
    }

    /** Bulk-apply maintenance or write-off to many assets (requires assets.retire). */
    public function bulk(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.retire'), 403);
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'exists:assets,id'],
            'op' => ['required', 'in:maintenance,writeoff'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $status = $data['op'] === 'writeoff' ? AssetStatus::Writeoff : AssetStatus::Maintenance;
        $count = $this->service->bulkSetStatus($data['ids'], $status, $data['reason'] ?? null);
        AuditLog::record('Bulk asset '.$data['op'], "{$count} assets");

        return response()->json(['message' => 'success', 'updated' => $count]);
    }
}
