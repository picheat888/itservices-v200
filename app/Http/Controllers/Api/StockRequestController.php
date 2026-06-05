<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StockRequestResource;
use App\Models\AuditLog;
use App\Models\StockItem;
use App\Models\StockItemSerial;
use App\Models\StockMovement;
use App\Models\StockRequest;
use App\Services\StockBalanceService;
use App\Services\StockLotService;
use App\Services\StockSerialService;
use App\Support\DocNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StockRequestController extends Controller
{
    public function __construct(
        private readonly StockSerialService $serialService,
        private readonly StockLotService $lotService,
        private readonly StockBalanceService $balances,
    ) {}

    /**
     * Request list. Approvers / fulfillers (and super) see every request;
     * everyone else sees only the ones they submitted.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user?->hasPermission('stock.view_request'), 403);

        $query = StockRequest::with('item')->latest();

        $seesAll = $user->isSuper() || $user->hasPermission('stock.approve') || $user->hasPermission('stock.fulfill');
        if (! $seesAll) {
            $query->where('user_id', $user->id);
        }

        $requests = $query->limit(200)->get();

        return response()->json([
            'data' => StockRequestResource::collection($requests),
            'meta' => ['total' => $requests->count()],
        ]);
    }

    /** Submit a new stock request (status: pending). */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user?->hasPermission('stock.request'), 403);

        $data = $request->validate([
            'stock_item_id' => ['required', 'integer', 'exists:stock_items,id'],
            'qty' => ['required', 'integer', 'min:1'],
            'reason' => ['required', 'string', 'max:2000'],
        ]);

        $stockRequest = StockRequest::create([
            'stock_item_id' => $data['stock_item_id'],
            'user_id' => $user->id,
            'requester_name' => $user->name,
            'qty' => $data['qty'],
            'reason' => $data['reason'],
            'status' => 'pending',
        ]);

        AuditLog::record('Submitted stock request', "#{$stockRequest->id} ×{$data['qty']}");

        return (new StockRequestResource($stockRequest->load('item')))->response()->setStatusCode(201);
    }

    /** Approve a pending request. */
    public function approve(Request $request, StockRequest $stockRequest): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.approve'), 403);
        $this->assertStatus($stockRequest, 'pending');

        $stockRequest->update([
            'status' => 'approved',
            'approver_name' => $request->user()->name,
            'approved_at' => now(),
        ]);
        AuditLog::record('Approved stock request', "#{$stockRequest->id}");

        return (new StockRequestResource($stockRequest->load('item')))->response();
    }

    /** Reject a pending request. */
    public function reject(Request $request, StockRequest $stockRequest): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.approve'), 403);
        $this->assertStatus($stockRequest, 'pending');

        $stockRequest->update([
            'status' => 'rejected',
            'approver_name' => $request->user()->name,
            'rejected_at' => now(),
        ]);
        AuditLog::record('Rejected stock request', "#{$stockRequest->id}");

        return (new StockRequestResource($stockRequest->load('item')))->response();
    }

    /** Fulfill an approved request: issue stock to the requester and decrement on-hand. */
    public function fulfill(Request $request, StockRequest $stockRequest): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user?->hasPermission('stock.fulfill'), 403);
        $this->assertStatus($stockRequest, 'approved');

        // A request can be issued across several source warehouses at once:
        //  - serialized items: derive the per-warehouse split from the chosen serials;
        //  - quantity items: an explicit `allocations` list, or the legacy single
        //    `from_warehouse` (whole qty from one warehouse).
        $data = $request->validate([
            'serial_ids' => ['array'],
            'serial_ids.*' => ['integer'],
            'allocations' => ['array'],
            'allocations.*.warehouse' => ['required_with:allocations', 'string', 'max:120'],
            'allocations.*.qty' => ['required_with:allocations', 'integer', 'min:1'],
            'from_warehouse' => ['nullable', 'string', 'max:120'],
        ]);

        DB::transaction(function () use ($stockRequest, $user, $data) {
            /** @var StockItem $item */
            $item = StockItem::lockForUpdate()->findOrFail($stockRequest->stock_item_id);

            if ($item->current_stock < $stockRequest->qty) {
                throw ValidationException::withMessages([
                    'qty' => "Not enough stock: {$item->current_stock} available.",
                ]);
            }

            // Build the per-warehouse allocation map (warehouse => qty).
            $serials = collect();
            if ($item->track_serial) {
                $serials = StockItemSerial::where('stock_item_id', $item->id)
                    ->where('status', 'in_stock')
                    ->whereIn('id', $data['serial_ids'] ?? [])
                    ->get();
                if ($serials->count() !== $stockRequest->qty) {
                    throw ValidationException::withMessages([
                        'serial_ids' => "Select exactly {$stockRequest->qty} in-stock serial(s) to issue.",
                    ]);
                }
                $allocation = $serials->groupBy(fn (StockItemSerial $s) => $s->warehouse ?: 'Unassigned')->map->count();
            } elseif (! empty($data['allocations'])) {
                $allocation = collect($data['allocations'])
                    ->groupBy('warehouse')
                    ->map(fn ($rows) => (int) collect($rows)->sum('qty'));
            } else {
                // Legacy single-warehouse path.
                $allocation = collect([(($data['from_warehouse'] ?? null) ?: 'Unassigned') => $stockRequest->qty]);
            }

            if ((int) $allocation->sum() !== $stockRequest->qty) {
                throw ValidationException::withMessages([
                    'allocations' => "Allocation across warehouses must total {$stockRequest->qty}.",
                ]);
            }

            $reference = $stockRequest->reference ?? "REQ-{$stockRequest->id}";

            // Group the chosen serials by their source warehouse so each issue movement
            // can claim — and link its events to — exactly the serials drawn from it.
            $serialsByWarehouse = $serials->groupBy(fn (StockItemSerial $s) => $s->warehouse ?: 'Unassigned');

            // One issue movement + per-warehouse balance deduction per source warehouse.
            foreach ($allocation as $warehouse => $qty) {
                if ($qty <= 0) {
                    continue;
                }
                $movement = StockMovement::create([
                    'doc_no' => DocNumber::next('issue', (int) now()->year),
                    'type' => 'issue',
                    'stock_item_id' => $item->id,
                    'qty' => $qty,
                    'from_label' => (string) $warehouse,
                    'to_label' => $stockRequest->requester_name,
                    'reference' => $reference,
                    'recorded_by' => $user->name,
                    'user_id' => $user->id,
                    'moved_at' => now(),
                ]);
                $this->balances->remove($item, (string) $warehouse, (int) $qty);

                // Serialized: mark this warehouse's serials issued and link their events to
                // THIS movement, so the movement-detail dialog lists them reliably.
                if ($item->track_serial) {
                    $whSerialIds = $serialsByWarehouse->get($warehouse, collect())->pluck('id')->all();
                    $this->serialService->issue($item, $whSerialIds, $user, $movement, $reference);
                }
            }

            // Cached total + FIFO happen once for the whole request.
            $item->current_stock -= $stockRequest->qty;
            $item->last_move_at = now()->toDateString();
            $item->save();
            $this->lotService->consume($item, $stockRequest->qty);

            $stockRequest->update(['status' => 'fulfilled', 'fulfilled_at' => now()]);
        });

        AuditLog::record('Fulfilled stock request', "#{$stockRequest->id} ×{$stockRequest->qty}");

        return (new StockRequestResource($stockRequest->load('item')))->response();
    }

    /** Guard a workflow transition, returning 422 when the request isn't in the expected state. */
    private function assertStatus(StockRequest $stockRequest, string $expected): void
    {
        if ($stockRequest->status !== $expected) {
            throw ValidationException::withMessages([
                'status' => "Request must be {$expected} (currently {$stockRequest->status}).",
            ]);
        }
    }
}
