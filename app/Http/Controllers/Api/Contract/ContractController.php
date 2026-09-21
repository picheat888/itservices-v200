<?php

namespace App\Http\Controllers\Api\Contract;

use App\Http\Controllers\Controller;
use App\Http\Requests\Contract\StoreContractRequest;
use App\Http\Resources\Contract\ContractResource;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Settings\AppSetting;
use App\Services\Contract\ContractExpiryAlertService;
use App\Services\Contract\ContractService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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
     * entered their own reminder window (any enabled threshold reached); the
     * "expired" tab narrows to live contracts whose end date has already passed;
     * search matches vendor/name/code. Soonest expiry first.
     */
    public function index(Request $request): JsonResponse
    {
        $this->gateView($request);

        $query = Contract::query()
            ->with(['vendor', 'attachments', 'assets.brand', 'assets.model', 'assets.category']);

        // Sort order — cancelled contracts always sink to the bottom regardless of the chosen sort.
        match ($request->query('sort', 'end_asc')) {
            'end_desc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('end_date', 'desc'),
            'created_desc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('created_at', 'desc'),
            'created_asc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('created_at', 'asc'),
            'value_desc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('value', 'desc'),
            'value_asc' => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('value', 'asc'),
            default => $query->orderByRaw('(cancelled_at IS NOT NULL OR expired_at IS NOT NULL)')->orderBy('end_date', 'asc'),
        };

        if ($request->filled('search')) {
            $q = '%'.$request->query('search').'%';
            $query->where(function ($w) use ($q) {
                $w->whereHas('vendor', fn ($v) => $v->where('name', 'like', $q))
                    ->orWhere('details', 'like', $q)
                    ->orWhere('name', 'like', $q)
                    ->orWhere('code', 'like', $q);
            });
        }

        if ($request->filled('type')) {
            $query->where('type', $request->query('type'));
        }

        if ($request->query('tab') === 'expiring') {
            // In reminder window = still active (not cancelled, not expired) AND some enabled threshold reached.
            $query->whereNull('cancelled_at')
                ->whereNull('expired_at')
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

        if ($request->query('tab') === 'expired') {
            // Overdue = still live (not cancelled, not expired) but the end date has already passed.
            $query->whereNull('cancelled_at')
                ->whereNull('expired_at')
                ->whereDate('end_date', '<=', now());
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

        $contracts = Contract::with('vendor')->get();

        $terminal = fn ($c) => $c->cancelled_at !== null || $c->expired_at !== null;
        $live = $contracts->reject($terminal);
        $expiring = $live->filter(fn ($c) => $c->isInReminder());
        $overdue = $live->filter(fn ($c) => $c->daysRemaining() <= 0);
        // "Active" = healthy contracts only — exclude those already inside their
        // reminder window so active/expiring/overdue stay mutually exclusive.
        $active = $live->filter(fn ($c) => $c->daysRemaining() > 0 && ! $c->isInReminder());
        $cancelled = $contracts->filter(fn ($c) => $c->cancelled_at !== null && $c->expired_at === null);
        $expired = $contracts->filter(fn ($c) => $c->expired_at !== null);

        $annual = $live->sum('value');

        $topVendors = $contracts
            ->groupBy(fn ($c) => $c->vendor?->name)
            ->map(fn ($group, $vendor) => [
                'vendor' => $vendor,
                'amount' => round($group->sum(fn ($c) => $c->annualValue())),
            ])
            ->sortByDesc('amount')
            ->take(5)
            ->values();

        // Dots for the timeline: the full 2 months behind us (the window's two
        // past columns) through ~12 months out.
        $timeline = $live
            ->filter(fn ($c) => $c->daysRemaining() > -95 && $c->daysRemaining() < 365)
            ->map(fn ($c) => [
                'id' => $c->id,
                'code' => $c->code,
                'name' => $c->name,
                'vendor' => $c->vendor?->name,
                'end' => $c->end_date->toDateString(),
                'days' => $c->daysRemaining(),
                // Mirror the Action-queue logic: amber dot = inside the contract's
                // own (per-contract) reminder window, not a fixed day threshold.
                'in_reminder' => $c->isInReminder(),
            ])
            ->values();

        $actionQueue = $expiring
            ->sortBy(fn ($c) => $c->daysRemaining())
            ->take(20)
            ->map(fn ($c) => [
                'id' => $c->id,
                'code' => $c->code,
                'name' => $c->name,
                'vendor' => $c->vendor?->name,
                'days' => $c->daysRemaining(),
            ])
            ->values();

        return response()->json([
            'total' => $contracts->count(),
            'active' => $active->count(),
            'expiring' => $expiring->count(),
            'overdue' => $overdue->count(),
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

        return (new ContractResource($contract->load(['vendor', 'assets.brand', 'assets.model', 'assets.category'])))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, Contract $contract): JsonResponse
    {
        $this->gateView($request);

        return (new ContractResource($contract->load(['vendor', 'attachments', 'assets.brand', 'assets.model', 'assets.category'])))->response();
    }

    public function update(StoreContractRequest $request, Contract $contract): JsonResponse
    {
        $before = $contract->getOriginal();
        $contract = $this->service->update($contract, $request->validated());
        AuditLog::record('Updated contract', "{$contract->name} ({$contract->code})", AuditLog::changes($before, $contract));

        return (new ContractResource($contract->load(['vendor', 'assets.brand', 'assets.model', 'assets.category'])))
            ->additional(['message' => 'success'])->response();
    }

    /**
     * Cancel a contract — early termination while it's still running. Requires the
     * contracts.cancel permission and a reason (stored on the contract).
     */
    public function cancel(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.cancel'), 403);

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $contract = $this->service->cancel($contract, $validated['reason']);
        AuditLog::record('Cancelled contract', "{$contract->name} ({$contract->code}) - {$validated['reason']}");

        return (new ContractResource($contract))
            ->additional(['message' => 'success'])->response();
    }

    /**
     * Reactivate a cancelled or expired contract — reopens it by clearing the
     * cancelled/expired timestamps. Requires the contracts.reactivate permission.
     */
    public function reactivate(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.reactivate'), 403);

        $contract = $this->service->reactivate($contract);
        $this->alertService->resetForContract($contract);
        AuditLog::record('Reactivated contract', "{$contract->name} ({$contract->code})");

        return (new ContractResource($contract))
            ->additional(['message' => 'success'])->response();
    }

    /** Permanently marks a contract as expired (admin close-out). Requires contracts.expire. */
    public function expire(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.expire'), 403);

        $contract = $this->service->expire($contract);
        AuditLog::record('Expired contract', "{$contract->name} ({$contract->code})");

        return (new ContractResource($contract))
            ->additional(['message' => 'success'])->response();
    }

    public function destroy(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.delete'), 403);

        // Hard-delete is only for a freshly-created contract added by mistake: it must
        // still be active (not cancelled/expired/overdue) and have no linked assets.
        // Anything past that is lifecycle-managed via Cancel/Expire instead.
        abort_unless($contract->status === 'active', 422, 'Only a newly created (active) contract can be deleted.');
        abort_if($contract->assets()->exists(), 422, 'Detach the linked assets before deleting this contract.');

        AuditLog::record('Deleted contract', "{$contract->name} ({$contract->code})");

        // Remove the attachment files; the DB rows go via cascade on delete.
        $paths = $contract->attachments()->pluck('path')->all();
        if ($paths !== []) {
            Storage::disk('local')->delete($paths);
        }
        $contract->delete();

        return response()->json(['message' => 'success']);
    }

    /** Formats an amount as a compact "฿4.31M" / "฿820K" string (symbol per Settings currency). */
    private function formatMoney(float $amount): string
    {
        $symbol = AppSetting::currencySymbol();

        if ($amount >= 1_000_000) {
            return $symbol.number_format($amount / 1_000_000, 2).'M';
        }

        if ($amount >= 1_000) {
            return $symbol.number_format($amount / 1_000).'K';
        }

        return $symbol.number_format($amount);
    }
}
