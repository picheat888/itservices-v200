<?php

namespace App\Http\Controllers\Api\Stock;

use App\Http\Controllers\Controller;
use App\Http\Resources\Stock\StockRequestResource;
use App\Models\AuditLog;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Services\Stock\StockIssuePdf;
use App\Services\Stock\StockIssueService;
use App\Services\Stock\StockLotReader;
use App\Services\Stock\StockNotificationService;
use App\Support\Refusal;
use App\Support\SearchTerms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StockRequestController extends Controller
{
    public function __construct(
        private readonly StockIssueService $issues,
    ) {}

    /**
     * Request list. Approvers / fulfillers (and super) see every request;
     * everyone else sees only the ones they submitted.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user?->hasPermission('stock.view_request'), 403);

        // Actionable first (await approval → await fulfillment → done), newest within each group.
        $query = StockRequest::with(['item.unit', 'user.employee', 'issueMovements'])
            ->orderByRaw("CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'fulfilled' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END")
            ->latest();

        $query->visibleTo($user);

        // Aggregate counts over the full (visibility-scoped) set — feed the sidebar
        // badge and the Requests tab chip, which must not depend on the current page.
        $pending = (clone $query)->where('status', 'pending')->count();
        $outstanding = (clone $query)->whereIn('status', ['pending', 'approved'])->count();

        // The status filter narrows the list only; the totals above stay across every status.
        $status = $request->query('status');
        if (in_array($status, ['pending', 'approved', 'fulfilled', 'rejected', 'cancelled'], true)) {
            $query->where('status', $status);
        }

        SearchTerms::apply($query, $request->query('search'), [
            'reference', 'requester_name',
            SearchTerms::related('item', ['sku', 'name']),
            SearchTerms::related('user', [SearchTerms::related('employee', ['code', ...SearchTerms::personName()])]),
        ]);

        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));
        $paginator = $query->paginate($perPage);

        return response()->json([
            'data' => StockRequestResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'pending' => $pending,
                'outstanding' => $outstanding,
            ],
        ]);
    }

    /** One request, behind the request list's gate: someone who only sees their own requests gets 404 for the rest. */
    public function show(Request $request, StockRequest $stockRequest): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user?->hasPermission('stock.view_request'), 403);

        abort_unless($stockRequest->isVisibleTo($user), 404);

        return (new StockRequestResource($stockRequest->load(['item.unit', 'user.employee', 'issueMovements'])))->response();
    }

    /** A request's issue and returns with their lots, behind the same gate and visibility as show. */
    public function trail(Request $request, StockRequest $stockRequest, StockLotReader $reader): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user?->hasPermission('stock.view_request'), 403);

        abort_unless($stockRequest->isVisibleTo($user), 404);

        return response()->json(['data' => $reader->trail($stockRequest)]);
    }

    /** Stream the issue sheet (ISS) PDF of a fulfilled request, behind the same gate and visibility as show. */
    public function issuePdf(Request $request, StockRequest $stockRequest, StockIssuePdf $sheets): StreamedResponse
    {
        $user = $request->user();
        abort_unless((bool) $user?->hasPermission('stock.view_request'), 403);

        abort_unless($stockRequest->isVisibleTo($user), 404);

        $bytes = $sheets->render($stockRequest, $user);
        $filename = $sheets->filename($stockRequest);

        return new StreamedResponse(function () use ($bytes) {
            echo $bytes;
        }, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => HeaderUtils::makeDisposition('inline', $filename, 'stock-issue.pdf'),
        ]);
    }

    /** Fulfilled requests of one item that still have something to return (the return form's picker). */
    public function returnable(Request $request, StockLotReader $reader): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.return'), 403);

        $data = $request->validate([
            'stock_item_id' => ['required', 'integer', 'exists:stock_items,id'],
            'search' => ['nullable', 'string', 'max:200'],
            'stock_request_id' => ['nullable', 'integer'],
        ]);

        return response()->json(['data' => $reader->returnable(
            StockItem::findOrFail($data['stock_item_id']),
            $data['search'] ?? null,
            isset($data['stock_request_id']) ? (int) $data['stock_request_id'] : null,
        )]);
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

        // The drawer caps the quantity at "available"; the API used to take anything.
        $available = StockItem::findOrFail($data['stock_item_id'])->availableToRequest();
        if ($data['qty'] > $available) {
            Refusal::fail('not_enough_stock', ['available' => $available], 'qty');
        }

        // Transaction holds the reference lock until the row is written; retried on deadlock
        $stockRequest = DB::transaction(fn (): StockRequest => StockRequest::create([
            'stock_item_id' => $data['stock_item_id'],
            'user_id' => $user->id,
            'requester_name' => $user->name,
            'qty' => $data['qty'],
            'reason' => $data['reason'],
            'status' => 'pending',
        ]), 3);

        AuditLog::record('Submitted stock request', "#{$stockRequest->id} ×{$data['qty']}", subject: $stockRequest);
        app(StockNotificationService::class)->requestCreated($stockRequest->load('item'));

        return (new StockRequestResource($stockRequest->load('item')))->response()->setStatusCode(201);
    }

    /** Approve a pending request. */
    public function approve(Request $request, StockRequest $stockRequest): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.approve'), 403);
        $this->assertNotOwn($request, $stockRequest);
        $this->assertStatus($stockRequest, 'pending');

        // Approving claims the stock, so check again: two requisitions filed while the same
        // units were free must not both be approved against them.
        DB::transaction(function () use ($request, $stockRequest) {
            $this->lockInStatus($stockRequest, 'pending');
            $available = StockItem::lockForUpdate()->findOrFail($stockRequest->stock_item_id)->availableToRequest();
            if ($stockRequest->qty > $available) {
                Refusal::fail('not_enough_stock', ['available' => $available], 'qty');
            }

            $stockRequest->update([
                'status' => 'approved',
                'approver_name' => $request->user()->name,
                'approved_at' => now(),
            ]);
        });
        AuditLog::record('Approved stock request', "#{$stockRequest->id}", subject: $stockRequest);
        app(StockNotificationService::class)->requestResponded($stockRequest->load('item'), 'approved');

        return (new StockRequestResource($stockRequest->load('item')))->response();
    }

    /** Reject a pending request. */
    public function reject(Request $request, StockRequest $stockRequest): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.approve'), 403);
        $this->assertNotOwn($request, $stockRequest);
        $this->assertStatus($stockRequest, 'pending');

        DB::transaction(function () use ($request, $stockRequest) {
            $this->lockInStatus($stockRequest, 'pending');
            $stockRequest->update([
                'status' => 'rejected',
                'approver_name' => $request->user()->name,
                'rejected_at' => now(),
            ]);
        });
        AuditLog::record('Rejected stock request', "#{$stockRequest->id}", subject: $stockRequest);
        app(StockNotificationService::class)->requestResponded($stockRequest->load('item'), 'rejected');

        return (new StockRequestResource($stockRequest->load('item')))->response();
    }

    /** Cancel a pending or approved request; an approved one's reserved stock is free again once it leaves "approved". */
    public function cancel(Request $request, StockRequest $stockRequest): JsonResponse
    {
        $user = $request->user();
        $this->assertCancellable($stockRequest);
        abort_unless($stockRequest->canBeCancelledBy($user), 403);

        DB::transaction(function () use ($user, $stockRequest) {
            $stockRequest->setRawAttributes(StockRequest::lockForUpdate()->findOrFail($stockRequest->id)->getAttributes(), true);
            $this->assertCancellable($stockRequest);
            // Approved meanwhile: the requester may no longer cancel
            if (! $stockRequest->canBeCancelledBy($user)) {
                Refusal::fail('request_not_cancellable', ['current' => $stockRequest->status], 'status');
            }

            $stockRequest->update([
                'status' => 'cancelled',
                'cancelled_by' => $user->name,
                'cancelled_at' => now(),
            ]);
        });
        AuditLog::record('Cancelled stock request', "#{$stockRequest->id}", subject: $stockRequest);
        if ((int) $stockRequest->user_id !== (int) $user->id) {
            app(StockNotificationService::class)->requestCancelled($stockRequest->load('item'));
        }

        return (new StockRequestResource($stockRequest->load('item')))->response();
    }

    /** Fulfill an approved request: issue stock to the requester and decrement on-hand. */
    public function fulfill(Request $request, StockRequest $stockRequest): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user?->hasPermission('stock.fulfill'), 403);
        $this->assertStatus($stockRequest, 'approved');

        // Serial items split by the picked serials; others by `allocations` or one `from_warehouse`
        $data = $request->validate([
            'serial_ids' => ['array'],
            'serial_ids.*' => ['integer'],
            'allocations' => ['array'],
            'allocations.*.warehouse' => ['required_with:allocations', 'string', 'max:120'],
            'allocations.*.qty' => ['required_with:allocations', 'integer', 'min:1'],
            'from_warehouse' => ['nullable', 'string', 'max:120'],
        ]);

        $this->issues->fulfil($stockRequest, $user, $data);

        // Fire a real-time stock-level alert now that on-hand has been decremented.
        app(StockNotificationService::class)->alert(StockItem::find($stockRequest->stock_item_id));

        AuditLog::record('Fulfilled stock request', "#{$stockRequest->id} ×{$stockRequest->qty}", subject: $stockRequest);
        app(StockNotificationService::class)->requestResponded($stockRequest->load('item'), 'fulfilled');

        return (new StockRequestResource($stockRequest->load(['item', 'issueMovements'])))
            ->additional(['issue' => $this->issues->summary($stockRequest)])
            ->response();
    }

    /** Nobody decides their own requisition — holding stock.approve included. */
    private function assertNotOwn(Request $request, StockRequest $stockRequest): void
    {
        abort_if((int) $stockRequest->user_id === (int) $request->user()?->id, 403, 'You cannot decide your own requisition.');
    }

    /** Re-read the row under lock inside the transaction so concurrent decisions cannot both pass. */
    private function lockInStatus(StockRequest $stockRequest, string $expected): void
    {
        $stockRequest->setRawAttributes(StockRequest::lockForUpdate()->findOrFail($stockRequest->id)->getAttributes(), true);
        $this->assertStatus($stockRequest, $expected);
    }

    /** Only a pending or approved request can still be cancelled. */
    private function assertCancellable(StockRequest $stockRequest): void
    {
        if (! in_array($stockRequest->status, ['pending', 'approved'], true)) {
            Refusal::fail('request_not_cancellable', ['current' => $stockRequest->status], 'status');
        }
    }

    /** Guard a workflow transition, returning 422 when the request isn't in the expected state. */
    private function assertStatus(StockRequest $stockRequest, string $expected): void
    {
        if ($stockRequest->status !== $expected) {
            Refusal::fail('request_wrong_status', ['expected' => $expected, 'current' => $stockRequest->status], 'status');
        }
    }
}
