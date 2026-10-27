<?php

namespace App\Http\Controllers\Api\Stock;

use App\Enums\Stock\StockCountReason;
use App\Enums\Stock\StockCountStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Stock\StockCountResource;
use App\Models\Stock\StockCount;
use App\Models\Stock\Warehouse;
use App\Services\Stock\StockCountService;
use App\Services\Stock\StockNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class StockCountController extends Controller
{
    public function __construct(private readonly StockCountService $service) {}

    /** Read access to count sessions (list / show). */
    private function gateView(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_count'), 403);
    }

    /** Mutating a count session (open / save / commit / cancel): the one counting permission. */
    private function gateManage(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view_count'), 403);
    }

    public function index(Request $request): JsonResponse
    {
        $this->gateView($request);

        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));
        $paginator = StockCount::with('countedBy')
            ->withCount(['lines', 'lines as counted_lines_count' => fn ($q) => $q->whereNotNull('counted_qty')])
            ->latest('id')->paginate($perPage);

        return response()->json([
            'data' => StockCountResource::collection($paginator->items()),
            'meta' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                // Open (draft) sessions across all pages — drives the Audit tab chip + sidebar badge.
                'draft' => StockCount::where('status', StockCountStatus::Draft)->count(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->gateManage($request);
        $data = $request->validate([
            // A real warehouse row; the 'Unassigned' sentinel is never countable
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')->where(fn ($q) => $q->where('name', '!=', 'Unassigned'))],
            'stock_item_ids' => ['required', 'array', 'min:1'],
            'stock_item_ids.*' => ['integer', 'exists:stock_items,id'],
        ]);

        $count = $this->service->open(Warehouse::findOrFail($data['warehouse_id']), $data['stock_item_ids'], $request->user());

        return (new StockCountResource($count->load(['countedBy', 'committedBy', 'recountOf', 'lines.item'])))
            ->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    public function show(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gateView($request);

        return (new StockCountResource($stockCount->load([
            'countedBy',
            'committedBy',
            'recountOf',
            'lines.item.serials' => fn ($q) => $q->where('status', 'in_stock'),
        ])))->response();
    }

    public function update(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gateManage($request);
        $data = $request->validate([
            'lines' => ['required', 'array'],
            'lines.*' => ['array'],
            'lines.*.counted_qty' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'lines.*.reason' => ['nullable', Rule::enum(StockCountReason::class)],
            'lines.*.reason_note' => ['nullable', 'string', 'max:500'],
            'lines.*.missing_serial_ids' => ['nullable', 'array'],
            'lines.*.missing_serial_ids.*' => ['integer'],
            'lines.*.found_serial_ids' => ['nullable', 'array'],
            'lines.*.found_serial_ids.*' => ['integer'],
        ]);

        // keys arrive as strings from JSON; cast to int line ids.
        $byLineId = [];
        foreach ($data['lines'] as $lineId => $payload) {
            $byLineId[(int) $lineId] = $payload;
        }

        $count = $this->service->saveLines($stockCount, $byLineId);

        return (new StockCountResource($count->load(['countedBy', 'committedBy', 'recountOf', 'lines.item'])))
            ->additional(['message' => 'success'])->response();
    }

    public function commit(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gateManage($request);
        // Confirming always adjusts; serial ticks come from the draft lines
        $request->validate(['mode' => ['prohibited']]);

        $count = $this->service->commit($stockCount, $request->user());

        // Stock-level alerts for the items whose on-hand changed
        foreach ($count->lines()->with('item')->get() as $line) {
            if ($line->item && ($line->variance() ?? 0) !== 0) {
                app(StockNotificationService::class)->alert($line->item->fresh());
            }
        }

        return (new StockCountResource($count->load(['countedBy', 'committedBy', 'recountOf', 'lines.item'])))
            ->additional(['message' => 'success'])->response();
    }

    public function destroy(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gateManage($request);
        $this->service->cancel($stockCount);

        return response()->json(['message' => 'success']);
    }
}
