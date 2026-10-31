<?php

namespace App\Http\Controllers\Api\Stock;

use App\Http\Controllers\Controller;
use App\Http\Requests\Stock\StoreStockMovementRequest;
use App\Http\Resources\Stock\StockMovementResource;
use App\Models\Stock\StockMovement;
use App\Services\Stock\StockLotReader;
use App\Services\Stock\StockMovementService;
use App\Support\PerPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StockMovementController extends Controller
{
    public function __construct(private readonly StockMovementService $movements) {}

    /** Paginated movement log, newest first, optionally filtered by type and item. */
    public function index(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_events'), 403);

        $paginator = $this->movements->page([
            'type' => $request->filled('type') ? $request->query('type') : null,
            'stock_item_id' => $request->filled('stock_item_id') ? $request->query('stock_item_id') : null,
            'search' => $request->query('search'),
        ], PerPage::from($request));

        return response()->json([
            'data' => StockMovementResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    /** One movement, behind the movement log's gate (a just-recorded row pinned on top of the log). */
    public function show(Request $request, StockMovement $movement): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_events'), 403);

        return (new StockMovementResource($movement->load(['item', 'user.employee'])))->response();
    }

    /** Serial codes tied to a movement (for the detail dialog), sourced from the serial-event log. */
    public function serials(Request $request, StockMovement $movement): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_events'), 403);

        return response()->json(['data' => $this->movements->serialCodes($movement)]);
    }

    /** The lots this movement's document touched, its request's returns and what is still returnable. */
    public function lots(Request $request, StockMovement $movement, StockLotReader $reader): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_events'), 403);

        return response()->json(['data' => $reader->forMovement($movement)]);
    }

    /** Stream an A4 sheet of 50 × 25 mm Code 128 serial stickers for one movement (dompdf). */
    public function labelsPdf(Request $request, StockMovement $movement): StreamedResponse
    {
        $user = $request->user();
        abort_unless((bool) (
            $user?->hasPermission('stock.view_events')
            || $user?->hasPermission('stock.receive')
            || $user?->hasPermission('stock.return')
            || $user?->hasPermission('stock.transfer')
        ), 403);

        $file = $this->movements->labelsPdf($movement);

        return new StreamedResponse(function () use ($file) {
            echo $file['bytes'];
        }, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => HeaderUtils::makeDisposition('inline', $file['filename'], 'serial-labels.pdf'),
        ]);
    }

    /** Record a receive, return or transfer and adjust on-hand stock. */
    public function store(StoreStockMovementRequest $request): JsonResponse
    {
        $movement = $this->movements->record($request->validated(), $request->user());

        return (new StockMovementResource($movement->load('item')))->response()->setStatusCode(201);
    }
}
