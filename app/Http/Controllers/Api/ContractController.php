<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreContractRequest;
use App\Http\Resources\ContractResource;
use App\Models\AppSetting;
use App\Models\AuditLog;
use App\Models\Contract;
use App\Services\ContractExpiryAlertService;
use App\Services\ContractService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

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

        $query = Contract::query()
            ->with(['attachments', 'assets'])
            ->orderByRaw('cancelled_at IS NOT NULL')
            ->orderBy('end_date');

        if ($request->filled('search')) {
            $q = '%'.$request->query('search').'%';
            $query->where(function ($w) use ($q) {
                $w->where('vendor', 'like', $q)
                    ->orWhere('title', 'like', $q)
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

        $contracts = Contract::all();

        $live = $contracts->filter(fn ($c) => $c->cancelled_at === null);
        $expiring = $live->filter(fn ($c) => $c->isInReminder());
        $expired = $live->filter(fn ($c) => $c->daysRemaining() <= 0);
        // "Active" = healthy contracts only — exclude those already inside their
        // reminder window so active/expiring/expired stay mutually exclusive.
        $active = $live->filter(fn ($c) => $c->daysRemaining() > 0 && ! $c->isInReminder());
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

        // Dots for the timeline: the full 2 months behind us (the window's two
        // past columns) through ~12 months out.
        $timeline = $live
            ->filter(fn ($c) => $c->daysRemaining() > -95 && $c->daysRemaining() < 365)
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

        return (new ContractResource($contract))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, Contract $contract): JsonResponse
    {
        $this->gateView($request);

        return (new ContractResource($contract->load(['attachments', 'assets'])))->response();
    }

    public function update(StoreContractRequest $request, Contract $contract): JsonResponse
    {
        $before = $contract->getOriginal();
        $contract = $this->service->update($contract, $request->validated());
        AuditLog::record('Updated contract', "{$contract->name} ({$contract->code})", AuditLog::changes($before, $contract));

        return (new ContractResource($contract))
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

        return (new ContractResource($contract))
            ->additional(['message' => 'success'])->response();
    }

    /** Toggles a contract's cancelled state. Requires the contracts.edit permission. */
    public function cancel(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.edit'), 403);

        $contract = $this->service->toggleCancel($contract);
        $action = $contract->cancelled_at !== null ? 'Cancelled contract' : 'Reactivated contract';
        AuditLog::record($action, "{$contract->name} ({$contract->code})");

        return (new ContractResource($contract))
            ->additional(['message' => 'success'])->response();
    }

    public function destroy(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.edit'), 403);
        AuditLog::record('Deleted contract', "{$contract->name} ({$contract->code})");

        // Remove the attachment files; the DB rows go via cascade on delete.
        $paths = $contract->attachments()->pluck('path')->all();
        if ($paths !== []) {
            Storage::disk('public')->delete($paths);
        }
        $contract->delete();

        return response()->json(['message' => 'success']);
    }

    /**
     * Streams a CSV template (UTF-8 BOM) with contract import headers + one sample row.
     */
    public function importTemplate(Request $request): StreamedResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.import'), 403);

        $headers = ['code', 'vendor', 'name', 'type', 'start_date', 'end_date', 'value', 'billing_cycle', 'auto_renew', 'notes'];
        $sample = ['', 'Microsoft', 'Microsoft 365 — 100 seats', 'software', '2025-01-01', '2026-01-01', '150000', 'yearly', '0', ''];

        return response()->streamDownload(function () use ($headers, $sample) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM
            fputcsv($out, $headers);
            fputcsv($out, $sample);
            fclose($out);
        }, 'contract-import-template.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * Bulk-imports contracts from an uploaded CSV. All-or-nothing: any bad row
     * aborts the whole import and returns a 422 with per-row errors.
     */
    public function import(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.import'), 403);

        $request->validate(['file' => ['required', 'file', 'max:5120']]);
        $file = $request->file('file');
        if (! in_array(strtolower($file->getClientOriginalExtension()), ['csv', 'txt'], true)) {
            return response()->json(['message' => 'รองรับเฉพาะไฟล์ .csv'], 422);
        }

        $rows = $this->readCsv($file->getRealPath());
        if ($rows === null || count($rows) === 0) {
            return response()->json(['message' => 'ไฟล์ว่างหรืออ่านไม่ได้'], 422);
        }

        $result = $this->service->importRows($rows);

        if (count($result['errors']) > 0) {
            return response()->json([
                'message' => 'พบข้อผิดพลาด ยังไม่ได้นำเข้าข้อมูล กรุณาแก้ไขแล้วลองใหม่',
                'errors' => $result['errors'],
            ], 422);
        }

        AuditLog::record('Imported contracts', $result['imported'].' รายการ');

        return response()->json(['message' => 'success', 'imported' => $result['imported']]);
    }

    /**
     * Parses a CSV file into an array of associative rows keyed by lower-cased
     * headers. Strips UTF-8 BOM and skips fully-blank lines.
     *
     * @return array<int, array<string, string>>|null
     */
    private function readCsv(string $path): ?array
    {
        if (($h = fopen($path, 'r')) === false) {
            return null;
        }

        $header = fgetcsv($h);
        if ($header === false) {
            fclose($h);

            return null;
        }
        $header = array_map(fn ($c) => strtolower(trim((string) $c)), $header);
        if (isset($header[0])) {
            $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0]);
        }

        $rows = [];
        while (($data = fgetcsv($h)) !== false) {
            if (count(array_filter($data, fn ($v) => trim((string) $v) !== '')) === 0) {
                continue;
            }
            $rows[] = array_combine($header, array_pad(array_map('strval', $data), count($header), ''));
        }
        fclose($h);

        return $rows;
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
