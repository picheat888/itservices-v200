<?php

namespace App\Http\Controllers\Api\Asset;

use App\Enums\Asset\AssetStatus;
use App\Enums\Contract\ContractType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Asset\StoreAssetRequest;
use App\Http\Resources\Asset\AssetResource;
use App\Http\Resources\Contract\ContractResource;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
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
            ->with(['brand', 'model', 'category', 'vendor'])
            ->where(fn ($q) => $q->whereNull('contract_id')
                ->when($contractId, fn ($w) => $w->orWhere('contract_id', $contractId)))
            ->orderBy('asset_code')
            ->get();

        return response()->json([
            'data' => $assets->map(fn (Asset $a) => [
                'id' => $a->id,
                'asset_code' => $a->asset_code,
                'name' => trim(($a->brand?->name ?? '').' '.($a->model?->name ?? '')) ?: $a->category?->name,
                'type' => $a->category?->name,
                'status' => $a->status->value,
            ])->all(),
        ]);
    }

    /**
     * Minimal contract list for the asset form's "link a rented asset to its vendor
     * contract" picker. Gated by the asset-registration permissions (register / edit) —
     * NOT contracts.view — so anyone who can fill this form can pick a contract without
     * being granted the whole Contract module. Returns just id / code / vendor / details.
     */
    public function contractOptions(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) ($user?->hasPermission('assets.register') || $user?->hasPermission('assets.edit')), 403);

        // Only hardware contracts may hold assets, so only they are offered here.
        $contracts = Contract::query()
            ->where('type', ContractType::Hardware)
            ->with('vendor')
            ->orderBy('code')
            ->get()
            ->map(fn (Contract $c) => [
                'id' => $c->id,
                'code' => $c->code,
                'vendor' => $c->vendor?->name,
                'details' => $c->details,
            ]);

        return response()->json(['data' => $contracts]);
    }

    /**
     * Paginated asset list with search (tag/model/owner/serial) and
     * type / source / status filters. Newest first.
     */
    public function index(Request $request): JsonResponse
    {
        $this->gateView($request);

        $query = Asset::query()->with(['contract.vendor', 'location', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee.position', 'ownerEmployee.department'])->latest('id');

        if ($request->filled('search')) {
            $q = '%'.$request->query('search').'%';
            $query->where(function ($w) use ($q) {
                $w->where('asset_code', 'like', $q)
                    ->orWhere('tag', 'like', $q)
                    ->orWhereHas('model', fn ($m) => $m->where('name', 'like', $q))
                    // Owner is a shared label on the asset, or the holding employee's code.
                    ->orWhere('owner', 'like', $q)
                    ->orWhereHas('ownerEmployee', fn ($e) => $e->where('code', 'like', $q)->orWhere('first_name', 'like', $q)->orWhere('last_name', 'like', $q))
                    ->orWhere('serial', 'like', $q);
            });
        }
        if ($request->filled('type')) {
            // The filter still sends the category name; match it through the relation.
            $query->whereHas('category', fn ($c) => $c->where('name', $request->query('type')));
        }
        if ($request->filled('source')) {
            $query->where('source', $request->query('source'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }
        if ($request->filled('warehouse')) {
            // The filter still sends the warehouse name; match it through the relation.
            $query->whereHas('warehouse', fn ($w) => $w->where('name', $request->query('warehouse')));
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

        // Eager-load location + category: top_value builds AssetResource (location?->name)
        // and the by-type breakdown groups on the category name. contract.vendor feeds the
        // rented assets' annualised value and supplier (both read live from the contract).
        $assets = Asset::with(['location', 'category', 'vendor', 'contract.vendor'])->get();

        $byType = $assets->groupBy(fn (Asset $a) => $a->category?->name)
            ->map(fn ($group, $type) => [
                'type' => $type,
                'count' => $group->count(),
            ])->sortByDesc('count')->values();

        $topValue = $assets->sortByDesc(fn (Asset $a) => $a->annualValue())->take(5)->values();

        return response()->json([
            'total' => $assets->count(),
            'deployed' => $assets->where('status', AssetStatus::Deployed)->count(),
            'ready' => $assets->where('status', AssetStatus::Ready)->count(),
            'common' => $assets->where('status', AssetStatus::Common)->count(),
            'pending_acceptance' => $assets->where('status', AssetStatus::PendingAcceptance)->count(),
            'pending_return' => $assets->where('status', AssetStatus::PendingReturn)->count(),
            'writeoff' => $assets->where('status', AssetStatus::Writeoff)->count(),
            'total_value' => round($assets->sum(fn (Asset $a) => $a->annualValue())),
            'by_type' => $byType,
            'top_value' => AssetResource::collection($topValue),
        ]);
    }

    /**
     * Assets assigned to the authenticated user (matched by owner_employee_id).
     * Employee self-service — no assets.view needed, only a linked employee record.
     */
    public function mine(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.my'), 403);
        $employee = $request->user()?->linkedEmployee();
        if ($employee === null) {
            return response()->json(['data' => []]);
        }

        $assets = Asset::query()
            ->with(['contract.vendor', 'location', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee.position', 'ownerEmployee.department'])
            ->where('owner_employee_id', $employee->id)
            ->latest('id')
            ->get();

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
        AuditLog::record('Registered asset', "{$asset->asset_code} - {$asset->model?->name}");

        return (new AssetResource($asset->load('contract.vendor', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee.position', 'ownerEmployee.department')))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, Asset $asset): JsonResponse
    {
        $this->gateView($request);

        $asset->load(['contract.vendor', 'transfers', 'tickets.assignee', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee.position', 'ownerEmployee.department']);

        return (new AssetResource($asset))->response();
    }

    /**
     * The contract linked to this asset, returned as a full ContractResource for the
     * read-only "peek" shown inside the Asset detail. Deliberately gated by assets.view
     * (not contracts.view): anyone who can view the asset can view its linked contract,
     * scoped to just that one asset's contract. Returns 404 when the asset has no contract.
     */
    public function contract(Request $request, Asset $asset): JsonResponse
    {
        $this->gateView($request);

        abort_unless($asset->contract_id, 404);

        $contract = $asset->contract()
            ->with(['vendor', 'attachments', 'assets.brand', 'assets.model', 'assets.category'])
            ->firstOrFail();

        return (new ContractResource($contract))->response();
    }

    public function update(StoreAssetRequest $request, Asset $asset): JsonResponse
    {
        // A written-off asset is retired — its record is frozen until the write-off is cancelled.
        abort_if($asset->status === AssetStatus::Writeoff, 422, 'A written-off asset cannot be edited. Cancel the write-off first.');

        $before = $asset->getOriginal();
        $asset = $this->service->update($asset, $request->validated());
        AuditLog::record('Updated asset', "{$asset->asset_code} - {$asset->model?->name}", AuditLog::changes($before, $asset));

        return (new AssetResource($asset->load('contract.vendor', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee.position', 'ownerEmployee.department')))
            ->additional(['message' => 'success'])->response();
    }

    /**
     * Undo a write-off — restores a retired asset back to the Ready pool. For the case an
     * admin marked the wrong asset. Requires the assets.cancel_writeoff permission.
     */
    public function cancelWriteoff(Request $request, Asset $asset): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.cancel_writeoff'), 403);
        abort_unless($asset->status === AssetStatus::Writeoff, 422, 'This asset is not written off.');

        $asset = $this->service->cancelWriteoff($asset);
        AuditLog::record('Cancelled asset write-off', $asset->asset_code);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /**
     * Permanently delete an asset (requires assets.delete — super-only by default).
     *
     * Guarded, not a blanket delete: only an asset that is still in the pool
     * (Ready to deploy) and NOT tied to a vendor contract may be removed. A
     * deployed / pending / written-off asset must be recalled or its write-off
     * cancelled first, and a contract-linked (rented) asset must be unlinked so
     * deleting it can never orphan a live contract line.
     */
    public function destroy(Request $request, Asset $asset): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.delete'), 403);
        abort_unless($asset->status === AssetStatus::Ready, 422, 'Only an asset that is Ready to deploy can be deleted.');
        abort_if($asset->contract_id !== null, 422, 'This asset is linked to a contract - unlink it before deleting.');

        AuditLog::record('Deleted asset', "{$asset->asset_code} - {$asset->model?->name}");
        $asset->delete();

        return response()->json(['message' => 'success']);
    }

    /** Transfer an asset to a new owner — an employee (pending acceptance) or a shared label (deployed). */
    public function transfer(Request $request, Asset $asset): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.transfer'), 403);
        $data = $request->validate([
            'mode' => ['required', 'in:employee,shared'],
            // Employee mode: pick a real employee. Shared mode: a short free-text label.
            'owner_employee_id' => ['required_if:mode,employee', 'integer', 'exists:employees,id'],
            'owner_label' => ['required_if:mode,shared', 'string', 'max:200'],
            // IT must record where the asset will physically go when handed over.
            'location_id' => ['required', 'integer', 'exists:locations,id'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);
        // Already out of the pool (employee-deployed or shared/common) — recall or return it first.
        abort_if($asset->isDeployed() || $asset->status === AssetStatus::Common, 422, 'Asset is deployed - mark it returned first.');

        $asset = $this->service->transfer($asset, $data, $request->user()?->name);
        AuditLog::record('Transferred asset', "{$asset->asset_code} → {$asset->ownerCode()}");

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /** Recipient accepts a pending-acceptance asset (only the employee who holds it). */
    public function accept(Request $request, Asset $asset): JsonResponse
    {
        // Only the recipient may confirm receipt — IT can hand over but not accept on their behalf.
        $employeeId = $request->user()?->linkedEmployee()?->id;
        abort_unless($employeeId !== null && $employeeId === $asset->owner_employee_id, 403);
        $asset = $this->service->accept($asset);
        AuditLog::record('Accepted asset', $asset->asset_code);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /**
     * Holder requests to return an asset they currently hold: deployed → pending return.
     * Only the current holder (matched by owner_employee_id) may request it.
     */
    public function requestReturn(Request $request, Asset $asset): JsonResponse
    {
        // Returning one's own asset is gated by assets.return (self-service, separate
        // from assets.my which merely opens the My Assets page).
        abort_unless((bool) $request->user()?->hasPermission('assets.return'), 403);
        $employeeId = $request->user()?->linkedEmployee()?->id;
        abort_unless($employeeId !== null && $employeeId === $asset->owner_employee_id && $asset->status === AssetStatus::Deployed, 403);
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);
        $asset = $this->service->requestReturn($asset, $data['reason'] ?? null);
        AuditLog::record('Requested asset return', $asset->asset_code);

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
        AuditLog::record('Received asset', $asset->asset_code);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /**
     * Pull an asset back into the pool without waiting on the current holder. Covers two cases
     * IT cannot otherwise undo:
     *  - a mis-directed hand-over not yet accepted (pending acceptance), and
     *  - a shared / common-use asset already deployed (no employee holds it, so there is nobody
     *    to request its return).
     * An employee-held deployed asset is intentionally excluded — it returns via the holder's
     * own Request-return flow. Gated by assets.transfer; a destination warehouse is required so
     * the pooled asset's location stays known.
     */
    public function recall(Request $request, Asset $asset): JsonResponse
    {
        $user = $request->user();
        // Ordinary recall (assets.transfer) only pulls back a pending hand-over or a shared
        // (owner-less) deployed asset. Force recall (super / assets.force_recall) is the
        // special-case override: it can pull back ANY out asset — including one an employee
        // still holds — regardless of state (only a written-off / already-pooled asset has
        // nothing to recall).
        $canForce = (bool) $user?->hasPermission('assets.force_recall');
        abort_unless((bool) $user?->hasPermission('assets.transfer') || $canForce, 403);

        $normallyRecallable = $asset->status === AssetStatus::PendingAcceptance
            || $asset->status === AssetStatus::Common;

        if ($canForce) {
            abort_if($asset->status === AssetStatus::Writeoff, 422, 'A written-off asset cannot be recalled.');
            abort_if($asset->status === AssetStatus::Ready, 422, 'This asset is already in the pool.');
        } else {
            abort_unless($normallyRecallable, 422, 'Only a pending hand-over or a shared deployed asset can be recalled.');
        }

        $data = $request->validate([
            'warehouse' => ['required', 'string', 'max:120'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);
        $asset = $this->service->recall($asset, $user?->name, $data['warehouse'], $data['reason'] ?? null);
        AuditLog::record($normallyRecallable ? 'Recalled asset' : 'Force-recalled asset', $asset->asset_code);

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

    /** Bulk-transfer many Ready assets to one employee (requires assets.transfer). */
    public function bulkTransfer(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.transfer'), 403);
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'exists:assets,id'],
            'mode' => ['required', 'in:employee,shared'],
            'owner_employee_id' => ['required_if:mode,employee', 'integer', 'exists:employees,id'],
            'owner_label' => ['required_if:mode,shared', 'string', 'max:200'],
            'location_id' => ['required', 'integer', 'exists:locations,id'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        // Ready (pooled) or Common (shared) assets can be handed out directly — a Common
        // asset is simply re-assigned (to a person, or to a different shared label).
        $assets = Asset::whereIn('id', $data['ids'])->get();
        $transferable = [AssetStatus::Ready, AssetStatus::Common];
        abort_if(
            $assets->contains(fn (Asset $a) => ! in_array($a->status, $transferable, true)),
            422,
            'Only assets that are Ready or Common can be transferred.',
        );

        foreach ($assets as $asset) {
            $this->service->transfer($asset, [
                'mode' => $data['mode'],
                'owner_employee_id' => $data['owner_employee_id'] ?? null,
                'owner_label' => $data['owner_label'] ?? null,
                'location_id' => $data['location_id'],
                'reason' => $data['reason'] ?? null,
            ], $request->user()?->name);
        }
        AuditLog::record('Bulk transferred assets', $assets->count().' assets');

        return response()->json(['message' => 'success', 'updated' => $assets->count()]);
    }

    /**
     * Bulk-recall many assets to a warehouse. Common (shared) assets need assets.transfer;
     * any other out state (an employee-held asset, etc.) needs assets.force_recall.
     */
    public function bulkRecall(Request $request): JsonResponse
    {
        $user = $request->user();
        $canForce = (bool) $user?->hasPermission('assets.force_recall');
        abort_unless((bool) $user?->hasPermission('assets.transfer') || $canForce, 403);
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'exists:assets,id'],
            'warehouse' => ['required', 'string', 'max:120'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $assets = Asset::whereIn('id', $data['ids'])->get();
        $normalStatuses = [AssetStatus::PendingAcceptance, AssetStatus::Common];
        $forced = false;
        foreach ($assets as $asset) {
            $normal = in_array($asset->status, $normalStatuses, true);
            $forceable = $canForce && ! in_array($asset->status, [AssetStatus::Ready, AssetStatus::Writeoff], true);
            abort_unless($normal || $forceable, 422, 'Some selected assets cannot be recalled.');
            if (! $normal) {
                $forced = true;
            }
        }
        foreach ($assets as $asset) {
            $this->service->recall($asset, $user?->name, $data['warehouse'], $data['reason'] ?? null);
        }
        AuditLog::record($forced ? 'Bulk force-recalled assets' : 'Bulk recalled assets', $assets->count().' assets');

        return response()->json(['message' => 'success', 'updated' => $assets->count()]);
    }

    /** Bulk-receive many pending-return assets back into a warehouse (requires assets.receive). */
    public function bulkReceive(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('assets.receive'), 403);
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer', 'exists:assets,id'],
            'warehouse' => ['required', 'string', 'max:120'],
        ]);

        $assets = Asset::whereIn('id', $data['ids'])->get();
        abort_if($assets->contains(fn (Asset $a) => $a->status !== AssetStatus::PendingReturn), 422, 'Only assets pending return can be received.');

        foreach ($assets as $asset) {
            $this->service->markReceived($asset, $request->user()?->name, $data['warehouse']);
        }
        AuditLog::record('Bulk received assets', $assets->count().' assets');

        return response()->json(['message' => 'success', 'updated' => $assets->count()]);
    }
}
