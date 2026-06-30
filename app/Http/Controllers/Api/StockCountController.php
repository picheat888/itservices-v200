<?php

namespace App\Http\Controllers\Api;

use App\Enums\StockCountAdjustMode;
use App\Http\Controllers\Controller;
use App\Http\Resources\StockCountResource;
use App\Models\StockCount;
use App\Services\StockCountService;
use App\Services\StockNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StockCountController extends Controller
{
    public function __construct(private readonly StockCountService $service) {}

    /** Read access to count sessions (list / show). */
    private function gateView(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_count'), 403);
    }

    /**
     * Mutating a count session (open / save / commit / cancel). Counting is a single
     * permission now, so the same key gates both reading and mutating.
     */
    private function gateManage(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_count'), 403);
    }

    public function index(Request $request): JsonResponse
    {
        $this->gateView($request);

        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));
        $paginator = StockCount::with(['countedBy', 'lines'])->latest('id')->paginate($perPage);

        return response()->json([
            'data' => StockCountResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                // Open (draft) sessions across all pages — drives the Audit tab chip + sidebar badge.
                'draft' => StockCount::where('status', 'draft')->count(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->gateManage($request);
        $data = $request->validate([
            'warehouse' => ['nullable', 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:2000'],
            'stock_item_ids' => ['array'],
            'stock_item_ids.*' => ['integer', 'exists:stock_items,id'],
        ]);

        $count = $this->service->open($data, $request->user());

        return (new StockCountResource($count->load(['countedBy', 'lines.item'])))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gateView($request);

        return (new StockCountResource($stockCount->load([
            'countedBy',
            'lines.item.serials' => fn ($q) => $q->where('status', 'in_stock'),
        ])))->response();
    }

    public function update(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gateManage($request);
        $data = $request->validate([
            'counts' => ['required', 'array'],
            'counts.*' => ['nullable', 'integer', 'min:0'],
        ]);

        // keys arrive as strings from JSON; cast to int line ids.
        $byLineId = [];
        foreach ($data['counts'] as $lineId => $qty) {
            $byLineId[(int) $lineId] = $qty === null ? null : (int) $qty;
        }

        $count = $this->service->saveCounts($stockCount, $byLineId);

        return (new StockCountResource($count->load(['countedBy', 'lines.item'])))
            ->additional(['message' => 'success'])->response();
    }

    public function commit(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gateManage($request);
        $data = $request->validate([
            'mode' => ['nullable', 'in:auto,manual'],
            'missing_serials' => ['array'],
            'missing_serials.*' => ['array'],
            'missing_serials.*.*' => ['integer'],
        ]);
        $mode = StockCountAdjustMode::from($data['mode'] ?? 'auto');

        // keys arrive as strings (stock-item ids) from JSON; cast to int.
        $missing = [];
        foreach ($data['missing_serials'] ?? [] as $itemId => $ids) {
            $missing[(int) $itemId] = array_map('intval', $ids);
        }

        $count = $this->service->commit($stockCount, $request->user(), $mode, $missing);

        // Fire real-time stock-level alerts for every item whose on-hand was adjusted.
        foreach ($count->lines()->with('item')->get() as $line) {
            if ($line->item) {
                app(StockNotificationService::class)->alert($line->item->fresh());
            }
        }

        return (new StockCountResource($count->load(['countedBy', 'lines.item'])))
            ->additional(['message' => 'success'])->response();
    }

    public function destroy(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gateManage($request);
        $this->service->cancel($stockCount);

        return response()->json(['message' => 'success']);
    }
}
