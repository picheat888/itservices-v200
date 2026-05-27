<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreContractRequest;
use App\Http\Resources\ContractResource;
use App\Models\AuditLog;
use App\Models\Contract;
use App\Services\ContractExpiryAlertService;
use App\Services\ContractService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContractController extends Controller
{
    public function __construct(
        private readonly ContractService $service,
        private readonly ContractExpiryAlertService $alertService,
    ) {}

    /** Gates read access to the contracts.view permission (super bypasses). */
    private function gateView(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.view'), 403);
    }

    /**
     * Paginated contract list. The "expiring" tab narrows to contracts that have
     * entered their own reminder window (any enabled threshold reached);
     * search matches vendor/name/code. Soonest expiry first.
     */
    public function index(Request $request): JsonResponse
    {
        $this->gateView($request);

        $query = Contract::with('owner')
            ->orderByRaw('cancelled_at IS NOT NULL')
            ->orderBy('end_date');

        if ($request->filled('search')) {
            $q = '%'.$request->query('search').'%';
            $query->where(function ($w) use ($q) {
                $w->where('vendor', 'like', $q)
                    ->orWhere('name', 'like', $q)
                    ->orWhere('code', 'like', $q);
            });
        }

        if ($request->filled('type')) {
            $query->where('type', $request->query('type'));
        }

        if ($request->query('tab') === 'expiring') {
            // In reminder window = still active (not cancelled) AND some enabled threshold reached.
            $query->whereNull('cancelled_at')
                ->whereDate('end_date', '>', now())
                ->where(function ($w) {
                    foreach (Contract::REMINDER_DAYS as $d) {
                        $w->orWhere(function ($q) use ($d) {
                            $q->where("notify_{$d}", true)
                                ->whereDate('end_date', '<=', now()->copy()->addDays($d));
                        });
                    }
                });
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

    /**
     * Dashboard aggregates: status counts, normalised annual spend, the top
     * vendors by spend, the 12-month expiry timeline, and the action queue.
     */
    public function summary(Request $request): JsonResponse
    {
        $this->gateView($request);

        $contracts = Contract::with('owner')->get();

        $live = $contracts->filter(fn ($c) => $c->cancelled_at === null);
        $expiring = $live->filter(fn ($c) => $c->isInReminder());
        $expired = $live->filter(fn ($c) => $c->daysRemaining() <= 0);
        $active = $live->filter(fn ($c) => $c->daysRemaining() > 0);
        $cancelled = $contracts->filter(fn ($c) => $c->cancelled_at !== null);

        $annual = $live->sum('value');

        $topVendors = $contracts
            ->groupBy('vendor')
            ->map(fn ($group, $vendor) => [
                'vendor' => $vendor,
                'amount' => round($group->sum(fn ($c) => $c->annualValue())),
            ])
            ->sortByDesc('amount')
            ->take(5)
            ->values();

        // Dots for the timeline: anything from 2 months ago to 12 months out.
        $timeline = $live
            ->filter(fn ($c) => $c->daysRemaining() > -60 && $c->daysRemaining() < 365)
            ->map(fn ($c) => [
                'id' => $c->id,
                'code' => $c->code,
                'name' => $c->name,
                'vendor' => $c->vendor,
                'end' => $c->end_date->toDateString(),
                'days' => $c->daysRemaining(),
            ])
            ->values();

        $actionQueue = $expiring
            ->sortBy(fn ($c) => $c->daysRemaining())
            ->take(6)
            ->map(fn ($c) => [
                'id' => $c->id,
                'code' => $c->code,
                'name' => $c->name,
                'vendor' => $c->vendor,
                'days' => $c->daysRemaining(),
            ])
            ->values();

        return response()->json([
            'total' => $contracts->count(),
            'active' => $active->count(),
            'expiring' => $expiring->count(),
            'expired' => $expired->count(),
            'cancelled' => $cancelled->count(),
            'annual_value' => $this->formatMoney($annual),
            'top_vendors' => $topVendors,
            'timeline' => $timeline,
            'action_queue' => $actionQueue,
        ]);
    }

    public function store(StoreContractRequest $request): JsonResponse
    {
        $contract = $this->service->create($request->validated());
        AuditLog::record('Created contract', "{$contract->name} ({$contract->code})");

        return (new ContractResource($contract->load('owner')))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, Contract $contract): JsonResponse
    {
        $this->gateView($request);

        return (new ContractResource($contract->load('owner')))->response();
    }

    public function update(StoreContractRequest $request, Contract $contract): JsonResponse
    {
        $contract = $this->service->update($contract, $request->validated());
        AuditLog::record('Updated contract', "{$contract->name} ({$contract->code})");

        return (new ContractResource($contract->load('owner')))
            ->additional(['message' => 'success'])->response();
    }

    /** Extends a contract's term. Requires the contracts.renew permission. */
    public function renew(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.renew'), 403);

        $months = (int) $request->input('months', 12);
        $contract = $this->service->renew($contract, $months > 0 ? $months : 12);
        $this->alertService->resetForContract($contract);
        AuditLog::record('Renewed contract', "{$contract->name} ({$contract->code})");

        return (new ContractResource($contract->load('owner')))
            ->additional(['message' => 'success'])->response();
    }

    /** Toggles a contract's cancelled state. Requires the contracts.edit permission. */
    public function cancel(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.edit'), 403);

        $contract = $this->service->toggleCancel($contract);
        $action = $contract->cancelled_at !== null ? 'Cancelled contract' : 'Reactivated contract';
        AuditLog::record($action, "{$contract->name} ({$contract->code})");

        return (new ContractResource($contract->load('owner')))
            ->additional(['message' => 'success'])->response();
    }

    public function destroy(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.edit'), 403);
        AuditLog::record('Deleted contract', "{$contract->name} ({$contract->code})");
        $contract->delete();

        return response()->json(['message' => 'success']);
    }

    /** Formats a baht amount as a compact "฿4.31M" / "฿820K" string. */
    private function formatMoney(float $amount): string
    {
        if ($amount >= 1_000_000) {
            return '฿'.number_format($amount / 1_000_000, 2).'M';
        }

        if ($amount >= 1_000) {
            return '฿'.number_format($amount / 1_000).'K';
        }

        return '฿'.number_format($amount);
    }
}
