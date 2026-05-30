<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StockRequestResource;
use App\Models\AuditLog;
use App\Models\StockItem;
use App\Models\StockMovement;
use App\Models\StockRequest;
use App\Services\StockLotService;
use App\Services\StockSerialService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StockRequestController extends Controller
{
    public function __construct(
        private readonly StockSerialService $serialService,
        private readonly StockLotService $lotService,
    ) {}

    /**
     * Request list. Approvers / fulfillers (and super) see every request;
     * everyone else sees only the ones they submitted.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user?->hasPermission('stock.view'), 403);

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

        // Serialized items require the exact serials being issued to be chosen.
        $data = $request->validate([
            'serial_ids' => ['array'],
            'serial_ids.*' => ['integer'],
        ]);

        DB::transaction(function () use ($stockRequest, $user, $data) {
            /** @var StockItem $item */
            $item = StockItem::lockForUpdate()->findOrFail($stockRequest->stock_item_id);

            if ($item->current_stock < $stockRequest->qty) {
                throw ValidationException::withMessages([
                    'qty' => "Not enough stock: {$item->current_stock} available.",
                ]);
            }

            StockMovement::create([
                'type' => 'issue',
                'stock_item_id' => $item->id,
                'qty' => $stockRequest->qty,
                'from_label' => $item->warehouse,
                'to_label' => $stockRequest->requester_name,
                'reference' => "REQ-{$stockRequest->id}",
                'recorded_by' => $user->name,
                'user_id' => $user->id,
                'moved_at' => now(),
            ]);

            $item->current_stock -= $stockRequest->qty;
            $item->last_move_at = now()->toDateString();
            $item->save();

            // Draw the issued units down the FIFO lots.
            $this->lotService->consume($item, $stockRequest->qty);

            // Retire the chosen serials from stock (no-op for quantity-only items).
            $this->serialService->issue($item, $data['serial_ids'] ?? [], $stockRequest->qty);

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
