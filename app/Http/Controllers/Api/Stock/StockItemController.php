<?php

namespace App\Http\Controllers\Api\Stock;

use App\Http\Controllers\Controller;
use App\Http\Requests\Stock\StoreStockItemRequest;
use App\Http\Resources\Stock\StockItemResource;
use App\Http\Resources\Stock\StockMovementResource;
use App\Http\Resources\Stock\StockReorderItemResource;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockItemSerial;
use App\Services\Stock\StockHistoryService;
use App\Services\Stock\StockItemListService;
use App\Services\Stock\StockItemService;
use App\Support\PerPage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StockItemController extends Controller
{
    public function __construct(
        private readonly StockItemListService $lists,
        private readonly StockItemService $items,
    ) {}

    /** Gate read access to the stock.view permission (super bypasses). */
    private function gateView(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view'), 403);
    }

    /** Gate the Dashboard summary to the stock.view_dashboard permission. */
    private function gateDashboard(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_dashboard'), 403);
    }

    /** Server-paginated item list with search, category / warehouse / status filters and sorting; all=1 for pickers. */
    public function index(Request $request): JsonResponse
    {
        $this->gateView($request);

        // A filter sent as an array (?status[]=) is ignored like an unknown value
        $text = fn (string $key): ?string => is_string($value = $request->query($key)) && trim($value) !== '' ? $value : null;
        $filters = [
            'search' => $request->query('search'),
            'category' => $text('category'),
            'warehouse' => $text('warehouse'),
            'status' => $text('status'),
            'sort' => $request->query('sort', 'name_asc'),
        ];

        if ($request->boolean('all')) {
            $items = $this->lists->all($filters);

            return response()->json([
                'data' => StockItemResource::collection($items),
                'meta' => ['total' => $items->count()],
            ]);
        }

        $paginator = $this->lists->page($filters, PerPage::from($request));

        return response()->json([
            'data' => StockItemResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    /** Dashboard aggregates: totals, min-max buckets, reorder lists, per-warehouse / per-category, recent movements. */
    public function summary(Request $request): JsonResponse
    {
        $this->gateDashboard($request);

        $figures = $this->lists->summary($request->user());
        $figures['out_items'] = StockReorderItemResource::collection($figures['out_items']);
        $figures['low_items'] = StockReorderItemResource::collection($figures['low_items']);
        $figures['recent_movements'] = $figures['recent_movements'] === null ? [] : StockMovementResource::collection($figures['recent_movements']);

        return response()->json($figures);
    }

    /** Every serial known to the system, for the receive drawer's live duplicate check. */
    public function serials(Request $request): JsonResponse
    {
        $this->gateView($request);

        return response()->json(['data' => StockItemSerial::orderBy('serial')->pluck('serial')]);
    }

    /** Create a stock item with an auto-generated running SKU (SKU-#######). */
    public function store(StoreStockItemRequest $request): JsonResponse
    {
        $item = $this->items->create($request->validated());

        return (new StockItemResource($item))->response()->setStatusCode(201);
    }

    /** Show a single stock item, including every per-unit serial registered to it. */
    public function show(Request $request, StockItem $stockItem): JsonResponse
    {
        $this->gateView($request);

        return (new StockItemResource($this->lists->loadDetail($stockItem)))->response();
    }

    /** Full audit history for one SKU: movement timeline + lots + per-serial event timelines. */
    public function history(Request $request, StockItem $stockItem, StockHistoryService $histories): JsonResponse
    {
        $this->gateView($request);

        return response()->json(['data' => $histories->build($stockItem)]);
    }

    /** Stream an A4 PDF of one history view (StockHistoryService::VIEWS; anything else prints the summary). */
    public function historyPdf(Request $request, StockItem $stockItem, StockHistoryService $histories): StreamedResponse
    {
        $this->gateView($request);

        $view = $request->query('v', 'summary');
        $file = $histories->pdf($stockItem, is_string($view) ? $view : 'summary', $request->user());

        // A real StreamedResponse (the tests read streamedContent())
        return new StreamedResponse(function () use ($file) {
            echo $file['bytes'];
        }, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => HeaderUtils::makeDisposition('inline', $file['filename'], 'history.pdf'),
        ]);
    }

    /** Update a stock item. */
    public function update(StoreStockItemRequest $request, StockItem $stockItem): JsonResponse
    {
        $this->items->update($stockItem, $request->validated());

        return (new StockItemResource($this->lists->withReserved($stockItem)))->response();
    }

    /** Delete an empty SKU that never moved (stock.delete); the reason it cannot is a 422. */
    public function destroy(Request $request, StockItem $stockItem): JsonResponse
    {
        abort_unless((bool) ($request->user()?->isSuper() || $request->user()?->hasPermission('stock.delete')), 403);

        $refusal = $this->items->delete($stockItem);
        if ($refusal !== null) {
            return response()->json($refusal, 422);
        }

        return response()->json(['message' => 'success']);
    }
}
