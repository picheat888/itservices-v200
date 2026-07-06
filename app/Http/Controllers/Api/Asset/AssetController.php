<?php

namespace App\Http\Controllers\Api\Asset;

use App\Enums\Asset\AssetStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Asset\StoreAssetRequest;
use App\Http\Resources\Asset\AssetResource;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\AuditLog;
use App\Services\Asset\AssetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AssetController extends Controller
{
    public function __construct(private readonly AssetService $service) {}

    /** Gate read access to the assets.view permission (super bypasses). */
    private function gateView(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.view'), 403);
    }

    /**
     * Assets that can be linked to a contract from the contract form: those not yet
     * linked anywhere, plus the ones already linked to the given contract (so the
     * picker can show current selections). Never lists assets owned by other contracts.
     */
    public function linkable(Request $request): JsonResponse
    {
        $this->gateView($request);

        $contractId = $request->integer('contract_id') ?: null;

        $assets = Asset::query()
            ->where(fn ($q) => $q->whereNull('contract_id')
                ->when($contractId, fn ($w) => $w->orWhere('contract_id', $contractId)))
            ->orderBy('tag')
            ->get();

        return response()->json([
            'data' => $assets->map(fn (Asset $a) => [
                'id' => $a->id,
                'tag' => $a->tag,
                'name' => trim(($a->brand ?? '').' '.($a->model ?? '')) ?: $a->type,
                'type' => $a->type,
                'status' => $a->status->value,
            ])->all(),
        ]);
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
                    ->orWhere('nickname', 'like', $q)
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
        if ($request->filled('warehouse')) {
            $query->where('warehouse', $request->query('warehouse'));
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

        $byType = $assets->groupBy(fn (Asset $a) => $a->type)
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
            'writeoff' => $assets->where('status', AssetStatus::Writeoff)->count(),
            'total_value' => round($assets->sum(fn (Asset $a) => $a->annualValue())),
            'by_type' => $byType,
            'top_value' => AssetResource::collection($topValue),
        ]);
    }

    /**
     * Assets assigned to the authenticated user (matched by their employee code).
     * Employee self-service — no assets.view needed, only a linked employee record.
     */
    public function mine(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.my'), 403);
        $code = $request->user()?->linkedEmployee()?->code;
        if ($code === null) {
            return response()->json(['data' => []]);
        }

        $assets = Asset::query()->with('contract')->where('owner', $code)->latest('id')->get();

        return response()->json(['data' => AssetResource::collection($assets)]);
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

        $asset->load(['contract', 'transfers', 'tickets.assignee']);

        return (new AssetResource($asset))->response();
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
            // IT must record where the asset will physically go when handed over.
            'location_id' => ['required', 'integer', 'exists:locations,id'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);
        abort_if($asset->isDeployed(), 422, 'Asset is deployed — mark it returned first.');

        $asset = $this->service->transfer($asset, $data['owner'], $data['location_id'], $data['reason'] ?? null, $request->user()?->name);
        AuditLog::record('Transferred asset', "{$asset->tag} → {$data['owner']}");

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /** Recipient accepts a pending-acceptance asset (requires assets.transfer). */
    public function accept(Request $request, Asset $asset): JsonResponse
    {
        // Only the recipient may confirm receipt — IT can hand over but not accept on their behalf.
        $code = $request->user()?->linkedEmployee()?->code;
        abort_unless($code !== null && $code === $asset->owner, 403);
        $asset = $this->service->accept($asset);
        AuditLog::record('Accepted asset', $asset->tag);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /**
     * Holder requests to return an asset they currently hold: deployed → pending return.
     * Only the current holder (matched by employee code) may request it.
     */
    public function requestReturn(Request $request, Asset $asset): JsonResponse
    {
        $code = $request->user()?->linkedEmployee()?->code;
        abort_unless($code !== null && $code === $asset->owner && $asset->status === AssetStatus::Deployed, 403);
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);
        $asset = $this->service->requestReturn($asset, $data['reason'] ?? null);
        AuditLog::record('Requested asset return', $asset->tag);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /**
     * Mark a returned asset as received back into the pool (requires assets.transfer).
     * A destination warehouse is required so a pooled asset's physical location is always known.
     */
    public function markReceived(Request $request, Asset $asset): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.receive'), 403);
        $data = $request->validate([
            'warehouse' => ['required', 'string', 'max:120'],
        ]);
        $asset = $this->service->markReceived($asset, $request->user()?->name, $data['warehouse']);
        AuditLog::record('Received asset', $asset->tag);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /** Bulk write-off many assets (requires assets.retire). */
    public function bulk(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.retire'), 403);
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'exists:assets,id'],
            'op' => ['required', 'in:writeoff'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $count = $this->service->bulkSetStatus($data['ids'], AssetStatus::Writeoff, $data['reason'] ?? null);
        AuditLog::record('Bulk asset '.$data['op'], "{$count} assets");

        return response()->json(['message' => 'success', 'updated' => $count]);
    }
}
