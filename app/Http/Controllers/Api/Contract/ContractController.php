<?php

namespace App\Http\Controllers\Api\Contract;

use App\Enums\Asset\AssetStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Contract\StoreContractRequest;
use App\Http\Resources\Contract\ContractResource;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Services\Contract\ContractService;
use App\Services\Contract\ContractSummaryService;
use App\Support\SearchTerms;
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
    public function index(Request $request): JsonResponse
    {
        $this->gateView($request);

        $query = Contract::query()
            ->with('vendor')
            ->withCount([
                'assets',
                'assets as open_assets_count' => fn ($assets) => $assets->where('status', '!=', AssetStatus::Writeoff->value),
            ]);

        // Sort order — cancelled contracts always sink to the bottom regardless of the chosen sort.
        match ($request->query('sort', 'end_asc')) {
            'end_desc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('end_date', 'desc'),
            'created_desc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('created_at', 'desc'),
            'created_asc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('created_at', 'asc'),
            'value_desc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('value', 'desc'),
            'value_asc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('value', 'asc'),
            default => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('end_date', 'asc'),
        };
        // Tie-breaker so equal dates/values never swap or repeat across pages.
        $query->orderBy('id');

        SearchTerms::apply($query, $request->query('search'), [
            'code', 'name', 'details',
            SearchTerms::related('vendor', ['name', 'name_th']),
        ]);

        if ($request->filled('type')) {
            $query->where('type', $request->query('type'));
        }

        if ($request->query('tab') === 'expiring') {
            // Contract::isInReminder() in SQL: live, ending today, or inside an enabled threshold
            $query->whereNull('cancelled_at')
                ->whereNull('expired_at')
                ->whereDate('end_date', '>=', today())
                ->where(function ($w) {
                    $w->whereDate('end_date', today());
                    foreach (Contract::REMINDER_DAYS as $d) {
                        $w->orWhere(function ($q) use ($d) {
                            $q->where("notify_{$d}", true)
                                ->whereDate('end_date', '<=', now()->copy()->addDays($d));
                        });
                    }
                });
        }

        if ($request->query('tab') === 'expired') {
            // Contract::isOverdue() in SQL: live, and the end date is before today
            $query->whereNull('cancelled_at')
                ->whereNull('expired_at')
                ->whereDate('end_date', '<', today());
        }

        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));
        $paginator = $query->paginate($perPage);

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
