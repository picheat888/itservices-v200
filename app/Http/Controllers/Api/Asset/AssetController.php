<?php

namespace App\Http\Controllers\Api\Asset;

use App\Enums\Asset\AssetStatus;
use App\Enums\Asset\AssetTransferKind;
use App\Enums\Contract\ContractType;
use App\Enums\Employee\EmployeeStatus;
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
use App\Models\Asset\AssetTransfer;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Employee\Employee;
use App\Models\Settings\Location;
use App\Models\Settings\WriteoffReason;
use App\Models\User;
use App\Services\Asset\AssetActionGuard;
use App\Services\Asset\AssetService;
use App\Services\Asset\AssetTopValueService;
use App\Support\OverviewPeriod;
use App\Support\SearchTerms;
use App\Support\SystemTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AssetController extends Controller
{
    /**
     * The statuses the dashboard counts as "in use" — the asset has left the pool and sits
     * with a holder. The two pending states belong here too: a hand-over awaiting acceptance
     * and a return awaiting receipt are both still out of the pool, so counting them as Ready
     * would overstate what IT can actually deploy today.
     *
     * @var list<AssetStatus>
     */
    private const IN_USE_STATUSES = [
        AssetStatus::Deployed,
        AssetStatus::Common,
        AssetStatus::PendingAcceptance,
        AssetStatus::PendingReturn,
    ];

    public function __construct(
        private readonly AssetService $service,
        private readonly AssetTopValueService $topValue,
        private readonly AssetActionGuard $guard,
    ) {}

    /** Gate read access to the assets.view permission (super bypasses). */
    private function gateView(Request $request): void
    {
        $this->guard->canView($request->user())->authorize();
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
        $this->guard->canPickContract($user)->authorize();

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
                'vendor_th' => $c->vendor?->name_th,
                'details' => $c->details,
                // Cancelled or expired: offered only as the asset's current contract, never as a new pick
                'closed' => $c->cancelled_at !== null || $c->expired_at !== null,
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

        $query = Asset::query()->with(['contract.vendor', 'location', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee.position', 'ownerEmployee.department', 'latestHandover'])->latest('id');

        SearchTerms::apply($query, $request->query('search'), [
            'asset_code', 'tag', 'serial',
            SearchTerms::related('model', ['name']),
            // Owner is a shared label on the asset, or the holding employee.
            'owner',
            SearchTerms::related('brand', ['name']),
            SearchTerms::related('location', ['name']),
            SearchTerms::related('contract', ['code']),
            SearchTerms::related('ownerEmployee', ['code', ...SearchTerms::personName(), SearchTerms::related('department', ['name', 'name_th'])]),
        ]);
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
     * Overview aggregates: status counts, total value, per-type breakdown and the highest-value
     * assets as of now; the hand-over / return chart over the chosen period (all time by default).
     */
    public function summary(Request $request): JsonResponse
    {
        $this->guard->canViewOverview($request->user())->authorize();

        // Eager loads for AssetResource, the by-type groups and the lease table
        $assets = Asset::with(['location', 'category', 'vendor', 'contract.vendor'])->get();

        // Each type carries its own Ready / In use / Write-off split so the dashboard can draw
        // one stacked bar per type. The three buckets add up to `count` — every status lands in
        // exactly one of them (see IN_USE_STATUSES).
        $byType = $assets->groupBy(fn (Asset $a) => $a->category?->name)
            ->map(fn ($group, $type) => [
                'type' => $type,
                'count' => $group->count(),
                'ready' => $group->where('status', AssetStatus::Ready)->count(),
                'used' => $group->whereIn('status', self::IN_USE_STATUSES)->count(),
                'writeoff' => $group->where('status', AssetStatus::Writeoff)->count(),
            ])->sortByDesc('count')->values();

        $inService = $assets->where('status', '!=', AssetStatus::Writeoff);

        return response()->json([
            'total' => $assets->count(),
            'deployed' => $assets->where('status', AssetStatus::Deployed)->count(),
            'ready' => $assets->where('status', AssetStatus::Ready)->count(),
            'common' => $assets->where('status', AssetStatus::Common)->count(),
            'pending_acceptance' => $assets->where('status', AssetStatus::PendingAcceptance)->count(),
            'pending_return' => $assets->where('status', AssetStatus::PendingReturn)->count(),
            'writeoff' => $assets->where('status', AssetStatus::Writeoff)->count(),
            'total_value' => round($assets->sum(fn (Asset $a) => $a->annualValue()), 2),
            'by_type' => $byType,
            'top_purchased' => AssetResource::collection($this->topValue->topPurchased($inService)),
            'top_rented' => $this->topValue->topRented($inService),
            'activity' => $this->activity(OverviewPeriod::fromRequest($request)),
        ]);
    }

    /**
     * Hand-overs and returns per chart column over the period, oldest first — the shape the
     * overview's activity chart draws. Every column is present even with nothing in it: a
     * missing one would slide the remaining bars along the axis and label them wrongly.
     *
     * Recalls count as returns: both put the asset back in the pool, and the chart answers
     * "how much came back", not "why". `kind` keeps them apart in the table for later.
     *
     * @return array{unit: string, data: list<array{month: string, handover: int, returned: int}>}
     */
    private function activity(OverviewPeriod $period): array
    {
        $rows = $period->apply(AssetTransfer::query(), 'created_at')->get(['kind', 'created_at']);
        $earliest = AssetTransfer::min('created_at');
        ['unit' => $unit, 'columns' => $columns] = $period->columns($earliest === null ? null : Carbon::parse($earliest));

        $data = array_map(fn (array $c) => ['month' => $c['start'], 'handover' => 0, 'returned' => 0], $columns);
        foreach ($rows as $row) {
            if ($row->created_at === null || ($row->kind && ! $row->kind->changesCustody())) {
                continue;
            }
            foreach ($columns as $i => $column) {
                if ($row->created_at->between($column['from'], $column['to'])) {
                    $data[$i][$row->kind?->isInbound() ? 'returned' : 'handover']++;
                    break;
                }
            }
        }

        return ['unit' => $unit, 'data' => $data];
    }

    /** Active employees who cannot accept a hand-over because they have no linked account, as id → 'no_account'. */
    public function recipientReadiness(Request $request): JsonResponse
    {
        $this->guard->canTransferAny($request->user())->authorize();

        $blocked = Employee::where('status', EmployeeStatus::Active->value)
            ->whereNotIn('id', User::whereNotNull('employee_id')->select('employee_id'))
            ->pluck('id')
            ->mapWithKeys(fn (int $id) => [$id => 'no_account']);

        return response()->json(['data' => $blocked]);
    }

    /**
     * Assets assigned to the authenticated user (matched by owner_employee_id).
     * Employee self-service — no permission needed, only a linked employee record.
     */
    public function mine(Request $request): JsonResponse
    {
        $employee = $request->user()?->linkedEmployee();
        if ($employee === null) {
            return response()->json(['data' => []]);
        }

        $assets = Asset::query()
            ->with(['contract.vendor', 'location', 'brand', 'model', 'category', 'vendor', 'warehouse', 'ownerEmployee.position', 'ownerEmployee.department', 'latestHandover'])
            ->where('owner_employee_id', $employee->id)
            ->latest('id')
            ->get();

        return response()->json(['data' => AssetResource::collection($assets)]);
    }

    /** Ownership-change history across all assets, newest first, paged and searched on the server. */
    public function transfers(Request $request): JsonResponse
    {
        $this->gateView($request);

        // Ownership only — a location correction keeps the same holder, so it belongs on the
        // asset's own History tab, not in a list of who handed what to whom.
        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));
        $page = AssetTransfer::with('performer.employee:id,first_name_th,last_name_th')->whereNot('kind', AssetTransferKind::Relocate)
            ->searchFor($request->query('search'))
            ->latest()->latest('id')
            ->paginate($perPage);
        $rows = collect($page->items());
        $names = AssetTransfer::employeeNamesFor($rows);
        $namesTh = AssetTransfer::employeeThaiNamesFor($rows);

        $log = $rows->map(fn (AssetTransfer $tr) => [
            'id' => $tr->id,
            // To the minute: several moves of the same asset can share a day, and the log is
            // read to reconstruct what happened in what order.
            'date' => SystemTime::dateTime($tr->created_at),
            // The asset as it was named then, plus the id so a row can open the record now.
            'asset_id' => $tr->asset_id,
            'asset_tag' => $tr->asset_tag,
            'asset_model' => $tr->asset_model,
            'kind' => $tr->kind?->value,
            'from_owner' => $tr->from_owner,
            'to_owner' => $tr->to_owner,
            // Set only when that end was an employee; a warehouse or shared label has none.
            'from_name' => $names[$tr->from_owner] ?? null,
            'to_name' => $names[$tr->to_owner] ?? null,
            'from_name_th' => $namesTh[$tr->from_owner] ?? null,
            'to_name_th' => $namesTh[$tr->to_owner] ?? null,
            'reason' => $tr->reason,
            'performed_by' => $tr->performed_by,
            'performed_by_th' => $tr->performer?->name_th,
        ]);

        return response()->json([
            'data' => $log,
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

    /**
     * Undo a write-off — restores a retired asset back to the Ready pool. For the case an
     * admin marked the wrong asset. Requires the assets.cancel_writeoff permission.
     */
    public function cancelWriteoff(Request $request, Asset $asset): JsonResponse
    {
        $this->guard->canCancelWriteoff($request->user(), $asset)->authorize();

        $wasReturned = $asset->returnedToVendor();
        $asset = $this->service->cancelWriteoff($asset);
        AuditLog::record($wasReturned ? 'Cancelled asset return to lessor' : 'Cancelled asset write-off', $asset->asset_code, subject: $asset);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /**
     * Permanently delete an asset (requires assets.delete — super-only by default).
     *
     * Guarded, not a blanket delete: only an asset that is still in the pool
     * (Ready to deploy) and NOT tied to a vendor contract may be removed. A
     * deployed / pending / written-off asset must be recalled or its write-off
     * cancelled first, and a contract-linked (rented) asset must be unlinked so
     * deleting it can never orphan a live contract line. An asset that has ever been
     * handed over is refused too — its custody trail must not go with it — and so is
     * one a ticket refers to.
     */
    public function destroy(Request $request, Asset $asset): JsonResponse
    {
        $this->guard->canDelete($request->user(), $asset)->authorize();

        $blocker = $this->service->deletionBlocker($asset);
        if ($blocker !== null) {
            return response()->json($blocker, 422);
        }

        AuditLog::recordDeleted('Deleted asset', "{$asset->asset_code} - {$asset->model?->name}", $asset);
        $asset->delete();

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

    /**
     * Holder requests to return an asset they currently hold: deployed → pending return.
     * Only the current holder (matched by owner_employee_id) may request it.
     */
    public function requestReturn(ReturnAssetRequest $request, Asset $asset): JsonResponse
    {
        $asset = $this->service->requestReturn($asset, $request->validated('reason'));
        AuditLog::record('Requested asset return', $asset->asset_code, subject: $asset);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /**
     * Mark a returned asset as received back into the pool (requires assets.transfer).
     * A destination warehouse is required so a pooled asset's physical location is always known.
     */
    public function markReceived(ReceiveAssetRequest $request, Asset $asset): JsonResponse
    {
        $asset = $this->service->markReceived($asset, $request->user(), $request->validated('warehouse'));
        AuditLog::record('Received asset', $asset->asset_code, subject: $asset);

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
    public function recall(RecallAssetRequest $request, Asset $asset): JsonResponse
    {
        $normallyRecallable = $this->guard->isNormalRecall($asset);
        $asset = $this->service->recall($asset, $request->user(), $request->validated('warehouse'), $request->validated('reason'));
        AuditLog::record($normallyRecallable ? 'Recalled asset' : 'Force-recalled asset', $asset->asset_code, subject: $asset);

        return (new AssetResource($asset))->additional(['message' => 'success'])->response();
    }

    /**
     * Bulk write-off many assets (requires assets.retire). The reason is required and comes from
     * the list in Settings → Assets (discarded, sold for scrap, donated, lease ended…) so the
     * write-off report can count by it; the note adds the details and is optional.
     */
    public function bulk(BulkWriteoffAssetRequest $request): JsonResponse
    {
        $data = $request->validated();

        $count = $this->service->bulkSetStatus($data['ids'], AssetStatus::Writeoff, $data['reason'] ?? null, (int) $data['writeoff_reason_id']);
        $reasonName = WriteoffReason::whereKey($data['writeoff_reason_id'])->value('name');
        // One entry per asset, so each asset's own history shows its write-off and who did it.
        foreach (Asset::whereIn('id', $data['ids'])->get() as $asset) {
            AuditLog::record('Wrote off asset', $asset->asset_code, ['facts' => array_filter(['reason' => $reasonName, 'note' => $data['reason'] ?? null])], subject: $asset);
        }

        return response()->json(['message' => 'success', 'updated' => $count]);
    }

    /**
     * Return rented assets to their lessor (requires assets.retire, the write-off permission — it
     * is the rented asset's way out of the register). No reason from the Settings list: the
     * return is its own fact (returned_to_vendor_at), which the write-off report counts on.
     * Undone like a write-off, through cancel-writeoff (assets.cancel_writeoff).
     */
    public function bulkReturnToVendor(ReturnToVendorRequest $request): JsonResponse
    {
        $data = $request->validated();

        $count = $this->service->returnToVendor($data['ids'], $data['reason'] ?? null);
        // One entry per asset, so each asset's own history shows the return and who made it.
        foreach (Asset::with('contract:id,code')->whereIn('id', $data['ids'])->get() as $asset) {
            AuditLog::record(
                'Returned asset to lessor',
                $asset->asset_code,
                ['facts' => array_filter(['contract' => $asset->contract?->code, 'note' => $data['reason'] ?? null])],
                subject: $asset,
            );
        }

        return response()->json(['message' => 'success', 'updated' => $count]);
    }

    /**
     * Update where one or many in-use assets physically sit. One endpoint serves both the
     * single-asset button in the detail drawer and the Inventory multi-select bar.
     *
     * Gated by assets.edit, not assets.transfer: this corrects an attribute of the record,
     * it does not move custody — the holder keeps the asset either way. For the same reason
     * only assets already in use qualify: a pooled asset lives in a warehouse (no location),
     * one awaiting acceptance has not arrived anywhere yet, and one on its way back or
     * written off is not sitting anywhere worth correcting.
     */
    public function bulkLocation(RelocateAssetsRequest $request): JsonResponse
    {
        $data = $request->validated();
        $assets = $request->assets();
        $location = Location::findOrFail($data['location_id']);
        $assets = $this->service->relocateMany($assets, $location, $request->user(), $data['note'] ?? null);
        // One entry per asset, so each asset's own history carries the move.
        foreach ($assets as $asset) {
            AuditLog::record('Updated asset location', "{$asset->asset_code} → {$location->name}", subject: $asset);
        }

        return response()->json(['message' => 'success', 'updated' => $assets->count()]);
    }

    /** Bulk-transfer many Ready assets to one employee (requires assets.transfer). */
    public function bulkTransfer(BulkTransferAssetRequest $request): JsonResponse
    {
        $data = $request->validated();
        $assets = $request->assets();

        // One bell and one mail for the recipient, not one per asset.
        $this->service->batchNotices(function () use ($assets, $data, $request) {
            foreach ($assets as $asset) {
                $this->service->transfer($asset, [
                    'mode' => $data['mode'],
                    'owner_employee_id' => $data['owner_employee_id'] ?? null,
                    'owner_label' => $data['owner_label'] ?? null,
                    'location_id' => $data['location_id'],
                    'reason' => $data['reason'] ?? null,
                ], $request->user());
            }
        });
        foreach ($assets as $asset) {
            AuditLog::record('Transferred asset', "{$asset->asset_code} → {$asset->ownerCode()}", subject: $asset);
        }

        return response()->json(['message' => 'success', 'updated' => $assets->count()]);
    }

    /**
     * Bulk-recall many assets to a warehouse. Common (shared) assets need assets.transfer;
     * any other out state (an employee-held asset, etc.) needs assets.force_recall.
     */
    public function bulkRecall(BulkRecallAssetRequest $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validated();
        $assets = $request->assets();
        $forcedIds = $assets->reject(fn (Asset $a) => $this->guard->isNormalRecall($a))->pluck('id')->all();
        // One bell and one mail per person recalled from, not one per asset.
        $this->service->batchNotices(function () use ($assets, $user, $data, $forcedIds) {
            foreach ($assets as $asset) {
                $this->service->recall($asset, $user, $data['warehouse'], $data['reason'] ?? null);
                // Named per asset, as the single recall does: only the ones outside the normal states were forced.
                AuditLog::record(in_array($asset->id, $forcedIds, true) ? 'Force-recalled asset' : 'Recalled asset', $asset->asset_code, subject: $asset);
            }
        });

        return response()->json(['message' => 'success', 'updated' => $assets->count()]);
    }

    /** Bulk-receive many pending-return assets back into a warehouse (requires assets.receive). */
    public function bulkReceive(BulkReceiveAssetRequest $request): JsonResponse
    {
        $data = $request->validated();
        $assets = $request->assets();

        foreach ($assets as $asset) {
            $this->service->markReceived($asset, $request->user(), $data['warehouse']);
        }
        foreach ($assets as $asset) {
            AuditLog::record('Received asset', $asset->asset_code, subject: $asset);
        }

        return response()->json(['message' => 'success', 'updated' => $assets->count()]);
    }
}
