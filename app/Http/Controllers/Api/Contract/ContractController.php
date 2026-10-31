<?php

namespace App\Http\Controllers\Api\Contract;

use App\Http\Controllers\Controller;
use App\Http\Requests\Contract\StoreContractRequest;
use App\Http\Resources\Contract\ContractResource;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Services\Contract\ContractListService;
use App\Services\Contract\ContractService;
use App\Services\Contract\ContractSummaryService;
use App\Support\PerPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContractController extends Controller
{
    public function __construct(
        private readonly ContractService $service,
        private readonly ContractSummaryService $summaries,
    ) {}

    /** Gates read access to the contracts.view permission (super bypasses). */
    private function gateView(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.view'), 403);
    }

    /** Paginated contract list with search, type, sort and the expiring / expired tabs. */
    public function index(Request $request, ContractListService $lists): JsonResponse
    {
        $this->gateView($request);

        $paginator = $lists->page([
            'sort' => $request->query('sort', 'end_asc'),
            'search' => $request->query('search'),
            'type' => $request->filled('type') ? $request->query('type') : null,
            'tab' => $request->query('tab'),
            'per_page' => PerPage::from($request),
        ]);

        return response()->json([
            'data' => ContractResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    /** The header alert counts; the Overview tab's figures need contracts.view_dashboard as well. */
    public function summary(Request $request): JsonResponse
    {
        $this->gateView($request);

        return response()->json($this->summaries->summary($request->user()->hasPermission('contracts.view_dashboard')));
    }

    public function store(StoreContractRequest $request): JsonResponse
    {
        $contract = $this->service->create($request->validated());
        AuditLog::record('Created contract', "{$contract->name} ({$contract->code})", subject: $contract);

        return (new ContractResource($contract->load(['vendor', 'assets.brand', 'assets.model', 'assets.category', 'assets.ownerEmployee', 'creator.employee', 'updater.employee', 'canceller'])))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, Contract $contract): JsonResponse
    {
        $this->gateView($request);

        return (new ContractResource($contract->load(['vendor', 'attachments', 'assets.brand', 'assets.model', 'assets.category', 'assets.ownerEmployee', 'creator.employee', 'updater.employee', 'canceller'])))->response();
    }

    public function update(StoreContractRequest $request, Contract $contract): JsonResponse
    {
        $before = $contract->getOriginal();
        $contract = $this->service->update($contract, $request->validated());
        AuditLog::record('Updated contract', "{$contract->name} ({$contract->code})", AuditLog::changes($before, $contract), subject: $contract);

        return (new ContractResource($contract->load(['vendor', 'assets.brand', 'assets.model', 'assets.category', 'assets.ownerEmployee', 'creator.employee', 'updater.employee', 'canceller'])))
            ->additional(['message' => 'success'])->response();
    }

    /** Cancel a running contract with a reason. Requires contracts.cancel. */
    public function cancel(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.cancel'), 403);

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $contract = $this->service->cancel($contract, $validated['reason']);
        AuditLog::record('Cancelled contract', "{$contract->name} ({$contract->code}) - {$validated['reason']}", subject: $contract);

        return (new ContractResource($contract))
            ->additional(['message' => 'success'])->response();
    }

    /** Reopen a cancelled or expired contract. Requires contracts.reactivate. */
    public function reactivate(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.reactivate'), 403);

        $contract = $this->service->reactivate($contract);
        AuditLog::record('Reactivated contract', "{$contract->name} ({$contract->code})", subject: $contract);

        return (new ContractResource($contract))
            ->additional(['message' => 'success'])->response();
    }

    /** Marks a contract as expired (admin close-out; reactivate can reopen it). Requires contracts.expire. */
    public function expire(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.expire'), 403);

        $contract = $this->service->expire($contract);
        AuditLog::record('Expired contract', "{$contract->name} ({$contract->code})", subject: $contract);

        return (new ContractResource($contract))
            ->additional(['message' => 'success'])->response();
    }

    /** Hard-delete a contract added by mistake (see ContractService::delete). Requires contracts.delete. */
    public function destroy(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.delete'), 403);

        $this->service->delete($contract);

        return response()->json(['message' => 'success']);
    }
}
