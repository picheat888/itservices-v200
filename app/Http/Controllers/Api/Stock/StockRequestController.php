<?php

namespace App\Http\Controllers\Api\Stock;

use App\Http\Controllers\Controller;
use App\Http\Resources\Stock\StockRequestResource;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockRequest;
use App\Services\Stock\StockIssuePdf;
use App\Services\Stock\StockIssueService;
use App\Services\Stock\StockLotReader;
use App\Services\Stock\StockRequestService;
use App\Support\PerPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StockRequestController extends Controller
{
    public function __construct(
        private readonly StockIssueService $issues,
        private readonly StockRequestService $requests,
    ) {}

    /**
     * Request list. Approvers / fulfillers (and super) see every request;
     * everyone else sees only the ones they submitted.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user?->hasPermission('stock.view_request'), 403);

        ['page' => $paginator, 'pending' => $pending, 'outstanding' => $outstanding] = $this->requests->page(
            $user,
            $request->query('status'),
            $request->query('search'),
            PerPage::from($request),
        );

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

        return (new StockRequestResource($stockRequest->load(['item.unit', 'user.employee', 'approver.employee', 'fulfiller.employee', 'issueMovements'])))->response();
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

        $stockRequest = $this->requests->create($user, $data);

        return (new StockRequestResource($stockRequest->load('item')))->response()->setStatusCode(201);
    }

    /** Approve a pending request. */
    public function approve(Request $request, StockRequest $stockRequest): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.approve'), 403);
        $this->requests->assertNotOwn($stockRequest, $request->user());

        $this->requests->approve($stockRequest, $request->user());

        return (new StockRequestResource($stockRequest->load(['item', 'approver.employee', 'fulfiller.employee'])))->response();
    }

    /** Reject a pending request. */
    public function reject(Request $request, StockRequest $stockRequest): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.approve'), 403);
        $this->requests->assertNotOwn($stockRequest, $request->user());

        $this->requests->reject($stockRequest, $request->user());

        return (new StockRequestResource($stockRequest->load(['item', 'approver.employee', 'fulfiller.employee'])))->response();
    }

    /** Cancel a pending or approved request; an approved one's reserved stock is free again once it leaves "approved". */
    public function cancel(Request $request, StockRequest $stockRequest): JsonResponse
    {
        $user = $request->user();
        $this->requests->assertCancellable($stockRequest);
        abort_unless($stockRequest->canBeCancelledBy($user), 403);

        $this->requests->cancel($stockRequest, $user);

        return (new StockRequestResource($stockRequest->load(['item', 'approver.employee', 'fulfiller.employee'])))->response();
    }

    /** Fulfill an approved request: issue stock to the requester and decrement on-hand. */
    public function fulfill(Request $request, StockRequest $stockRequest): JsonResponse
    {
        $user = $request->user();
        abort_unless((bool) $user?->hasPermission('stock.fulfill'), 403);
        $this->requests->assertStatus($stockRequest, 'approved');

        // Serial items split by the picked serials; others by `allocations` or one `from_warehouse`
        $data = $request->validate([
            'serial_ids' => ['array'],
            'serial_ids.*' => ['integer'],
            'allocations' => ['array'],
            'allocations.*.warehouse' => ['required_with:allocations', 'string', 'max:120'],
            'allocations.*.qty' => ['required_with:allocations', 'integer', 'min:1'],
            'from_warehouse' => ['nullable', 'string', 'max:120'],
        ]);

        $this->requests->fulfil($stockRequest, $user, $data);

        return (new StockRequestResource($stockRequest->load(['item', 'approver.employee', 'fulfiller.employee', 'issueMovements'])))
            ->additional(['issue' => $this->issues->summary($stockRequest)])
            ->response();
    }
}
