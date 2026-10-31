<?php

namespace App\Http\Controllers\Api\Asset;

use App\Http\Controllers\Controller;
use App\Http\Requests\Asset\BulkRecallAssetRequest;
use App\Http\Requests\Asset\BulkReceiveAssetRequest;
use App\Http\Requests\Asset\BulkTransferAssetRequest;
use App\Http\Requests\Asset\BulkWriteoffAssetRequest;
use App\Http\Requests\Asset\RecallAssetRequest;
use App\Http\Requests\Asset\ReceiveAssetRequest;
use App\Http\Requests\Asset\RelocateAssetsRequest;
use App\Http\Requests\Asset\ReturnAssetRequest;
use App\Http\Requests\Asset\ReturnToVendorRequest;
use App\Http\Requests\Asset\StoreAssetRequest;
use App\Http\Requests\Asset\TransferAssetRequest;
use App\Http\Resources\Asset\AssetResource;
use App\Http\Resources\Contract\ContractResource;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Settings\Location;
use App\Services\Asset\AssetActionGuard;
use App\Services\Asset\AssetBulkActionService;
use App\Services\Asset\AssetListService;
use App\Services\Asset\AssetService;
use App\Services\Asset\AssetSummaryService;
use App\Support\OverviewPeriod;
use App\Support\PerPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AssetController extends Controller
{
    public function __construct(
        private readonly AssetService $service,
        private readonly AssetActionGuard $guard,
        private readonly AssetListService $lists,
        private readonly AssetBulkActionService $bulk,
    ) {}

    /** Gate read access to the assets.view permission (super bypasses). */
    private function gateView(Request $request): void
    {
        $this->guard->canView($request->user())->authorize();
    }

    /** Assets the contract form may link: free ones plus those already on the given contract, never another contract's. */
    public function linkable(Request $request): JsonResponse
    {
        // The contract form's picker: whoever may create or edit a contract, not whoever may browse assets
        $user = $request->user();
        abort_unless((bool) ($user?->hasPermission('contracts.create') || $user?->hasPermission('contracts.edit')), 403);

        ['page' => $page, 'rows' => $rows] = $this->lists->linkable($request->integer('contract_id') ?: null, $request->query('search'));

        return response()->json([
            'data' => $rows,
            'meta' => ['total' => $page->total(), 'per_page' => $page->perPage(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()],
        ]);
    }

    /** Hardware contracts for the asset form's lessor-contract picker; gated by the registration rights, not contracts.view. */
    public function contractOptions(Request $request): JsonResponse
    {
        $this->guard->canPickContract($request->user())->authorize();

        return response()->json(['data' => $this->lists->contractOptions()]);
    }

    /** The register, newest first, with search and type / source / status / warehouse filters. */
    public function index(Request $request): JsonResponse
    {
        $this->gateView($request);

        $paginator = $this->lists->page([
            'search' => $request->query('search'),
            'type' => $request->filled('type') ? $request->query('type') : null,
            'source' => $request->filled('source') ? $request->query('source') : null,
            'status' => $request->filled('status') ? $request->query('status') : null,
            'warehouse' => $request->filled('warehouse') ? $request->query('warehouse') : null,
            'per_page' => PerPage::from($request),
        ]);

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

    /** Overview figures as of now, and the hand-over / return chart over the chosen period (all time by default). */
    public function summary(Request $request, AssetSummaryService $summary): JsonResponse
    {
        $this->guard->canViewOverview($request->user())->authorize();

        $figures = $summary->summary(OverviewPeriod::fromRequest($request));
        $figures['top_purchased'] = AssetResource::collection($figures['top_purchased']);

        return response()->json($figures);
    }

    /** Active employees who cannot accept a hand-over because they have no linked account, as id → 'no_account'. */
    public function recipientReadiness(Request $request): JsonResponse
    {
        $this->guard->canTransferAny($request->user())->authorize();

        return response()->json(['data' => $this->lists->recipientReadiness()]);
    }

    /** The assets the signed-in user holds; self-service, only a linked employee record needed. */
    public function mine(Request $request): JsonResponse
    {
        return response()->json(['data' => AssetResource::collection($this->lists->mine($request->user()))]);
    }

    /** Ownership-change history across all assets, newest first, paged and searched on the server. */
    public function transfers(Request $request): JsonResponse
    {
        $this->gateView($request);

        ['page' => $page, 'rows' => $rows] = $this->lists->transfers($request->query('search'), PerPage::from($request));

        return response()->json([
            'data' => $rows,
            'meta' => ['total' => $page->total(), 'per_page' => $page->perPage(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()],
        ]);
    }

    public function store(StoreAssetRequest $request): JsonResponse
    {
        $asset = $this->service->create($request->validated());
        AuditLog::record('Registered asset', "{$asset->asset_code} - {$asset->model?->name}", subject: $asset);

        return (new AssetResource($asset->load('contract.vendor', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee.position', 'ownerEmployee.department')))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, Asset $asset): JsonResponse
    {
        $this->gateView($request);

        $asset->load(['contract.vendor', 'transfers.performer.employee:id,first_name_th,last_name_th', 'tickets.assignee.employee', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee.position', 'ownerEmployee.department', 'creator.employee', 'updater.employee', 'writtenOffBy.employee', 'writeoffReason', 'returnedToVendorBy.employee']);

        return (new AssetResource($asset))->response();
    }

    /** The asset's linked contract for the read-only peek; gated by assets.view (that one contract only), 404 when none. */
    public function contract(Request $request, Asset $asset): JsonResponse
    {
        $this->gateView($request);

        abort_unless($asset->contract_id, 404);

        $contract = $asset->contract()
            ->with(['vendor', 'attachments', 'assets.brand', 'assets.model', 'assets.category', 'assets.ownerEmployee'])
            ->firstOrFail();

        return (new ContractResource($contract))->response();
    }

    public function update(StoreAssetRequest $request, Asset $asset): JsonResponse
    {
        $this->guard->canUpdate($asset)->authorize();

        $before = $asset->getOriginal();
        $asset = $this->service->update($asset, $request->validated());
        AuditLog::record('Updated asset', "{$asset->asset_code} - {$asset->model?->name}", AuditLog::changes($before, $asset), subject: $asset);

        return (new AssetResource($asset->load('contract.vendor', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee.position', 'ownerEmployee.department')))
            ->additional(['message' => 'success'])->response();
    }

    /** Undo a write-off (or a return to the lessor) back to the Ready pool; assets.cancel_writeoff. */
    public function cancelWriteoff(Request $request, Asset $asset): JsonResponse
    {
        $this->guard->canCancelWriteoff($request->user(), $asset)->authorize();

        $wasReturned = $asset->returnedToVendor();
        $asset = $this->service->cancelWriteoff($asset);
        AuditLog::record($wasReturned ? 'Cancelled asset return to lessor' : 'Cancelled asset write-off', $asset->asset_code, subject: $asset);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /** Delete a Ready asset with no contract, custody history or ticket (assets.delete); the blocker is a 422. */
    public function destroy(Request $request, Asset $asset): JsonResponse
    {
        $this->guard->canDelete($request->user(), $asset)->authorize();

        $blocker = $this->bulk->delete($asset);
        if ($blocker !== null) {
            return response()->json($blocker, 422);
        }

        return response()->json(['message' => 'success']);
    }

    /** Transfer an asset to a new owner — an employee (pending acceptance) or a shared label (deployed). */
    public function transfer(TransferAssetRequest $request, Asset $asset): JsonResponse
    {
        $asset = $this->service->transfer($asset, $request->validated(), $request->user());
        AuditLog::record('Transferred asset', "{$asset->asset_code} → {$asset->ownerCode()}", subject: $asset);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /** Recipient accepts a pending-acceptance asset (only the employee who holds it). */
    public function accept(Request $request, Asset $asset): JsonResponse
    {
        $this->guard->canAccept($request->user(), $asset)->authorize();
        $asset = $this->service->accept($asset);
        AuditLog::record('Accepted asset', $asset->asset_code, subject: $asset);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /** The current holder asks to return what they hold: deployed → pending return. */
    public function requestReturn(ReturnAssetRequest $request, Asset $asset): JsonResponse
    {
        $asset = $this->service->requestReturn($asset, $request->validated('reason'));
        AuditLog::record('Requested asset return', $asset->asset_code, subject: $asset);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /** A returned asset received back into a named warehouse. */
    public function markReceived(ReceiveAssetRequest $request, Asset $asset): JsonResponse
    {
        $asset = $this->service->markReceived($asset, $request->user(), $request->validated('warehouse'));
        AuditLog::record('Received asset', $asset->asset_code, subject: $asset);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /** Pull an asset back to a warehouse without the holder (a mis-sent hand-over or a shared asset; others are forced). */
    public function recall(RecallAssetRequest $request, Asset $asset): JsonResponse
    {
        $normallyRecallable = $this->guard->isNormalRecall($asset);
        $asset = $this->service->recall($asset, $request->user(), $request->validated('warehouse'), $request->validated('reason'));
        AuditLog::record($normallyRecallable ? 'Recalled asset' : 'Force-recalled asset', $asset->asset_code, subject: $asset);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /** Write off many assets with a reason from Settings -> Assets (assets.retire). */
    public function bulk(BulkWriteoffAssetRequest $request): JsonResponse
    {
        $data = $request->validated();
        $count = $this->bulk->writeOff($data['ids'], (int) $data['writeoff_reason_id'], $data['reason'] ?? null);

        return response()->json(['message' => 'success', 'updated' => $count]);
    }

    /** Return rented assets to their lessor (assets.retire); undone through cancel-writeoff. */
    public function bulkReturnToVendor(ReturnToVendorRequest $request): JsonResponse
    {
        $data = $request->validated();
        $count = $this->bulk->returnToVendor($data['ids'], $data['reason'] ?? null);

        return response()->json(['message' => 'success', 'updated' => $count]);
    }

    /** Correct where in-use assets sit (assets.edit, not a custody change); one endpoint for one or many. */
    public function bulkLocation(RelocateAssetsRequest $request): JsonResponse
    {
        $data = $request->validated();
        $location = Location::findOrFail($data['location_id']);
        $moved = $this->bulk->relocate($request->assets(), $location, $request->user(), $data['note'] ?? null);

        return response()->json(['message' => 'success', 'updated' => $moved->count()]);
    }

    /** Hand many Ready assets to one owner (assets.transfer). */
    public function bulkTransfer(BulkTransferAssetRequest $request): JsonResponse
    {
        $assets = $request->assets();
        $this->bulk->transfer($assets, $request->validated(), $request->user());

        return response()->json(['message' => 'success', 'updated' => $assets->count()]);
    }

    /** Recall many assets to a warehouse; shared ones need assets.transfer, others assets.force_recall. */
    public function bulkRecall(BulkRecallAssetRequest $request): JsonResponse
    {
        $data = $request->validated();
        $assets = $request->assets();
        $this->bulk->recall($assets, $request->user(), $data['warehouse'], $data['reason'] ?? null);

        return response()->json(['message' => 'success', 'updated' => $assets->count()]);
    }

    /** Receive many pending-return assets into a warehouse (assets.receive). */
    public function bulkReceive(BulkReceiveAssetRequest $request): JsonResponse
    {
        $assets = $request->assets();
        $this->bulk->receive($assets, $request->user(), $request->validated('warehouse'));

        return response()->json(['message' => 'success', 'updated' => $assets->count()]);
    }
}
