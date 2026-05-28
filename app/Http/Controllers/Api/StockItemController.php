<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreStockItemRequest;
use App\Http\Resources\StockItemResource;
use App\Models\AuditLog;
use App\Models\StockItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StockItemController extends Controller
{
    /** Gate read access to the stock.view permission (super bypasses). */
    private function gateView(Request $request): void
    {
        abort_unless((bool) $request->user()?->hasPermission('stock.view'), 403);
    }

    /**
     * Paginated stock item list with search and category/warehouse/status filters.
     * Status is derived, so status filtering happens after the collection is built.
     */
    public function index(Request $request): JsonResponse
    {
        $this->gateView($request);

        $query = StockItem::query()->orderBy('name');

        if ($request->filled('search')) {
            $q = '%'.$request->query('search').'%';
            $query->where(function ($w) use ($q) {
                $w->where('name', 'like', $q)
                    ->orWhere('sku', 'like', $q)
                    ->orWhere('brand', 'like', $q)
                    ->orWhere('model', 'like', $q);
            });
        }
        if ($request->filled('category')) {
            $query->where('category', $request->query('category'));
        }
        if ($request->filled('warehouse')) {
            $query->where('warehouse', $request->query('warehouse'));
        }

        $items = $query->get();

        if ($request->filled('status')) {
            $status = $request->query('status');
            // 'alerts' is a virtual filter: show every item that is not healthy (ok).
            $items = $status === 'alerts'
                ? $items->filter(fn (StockItem $i) => $i->status() !== 'ok')->values()
                : $items->filter(fn (StockItem $i) => $i->status() === $status)->values();
        }

        return response()->json([
            'data' => StockItemResource::collection($items),
            'meta' => ['total' => $items->count()],
        ]);
    }

    /**
     * Dashboard aggregates: SKU/unit/value totals, min-max alert buckets
     * (low/out, overstock, dead stock), and per-warehouse / per-category breakdowns.
     */
    public function summary(Request $request): JsonResponse
    {
        $this->gateView($request);

        $items = StockItem::all();

        $out = $items->filter(fn (StockItem $i) => $i->status() === 'out');
        $low = $items->filter(fn (StockItem $i) => $i->status() === 'low');
        $over = $items->filter(fn (StockItem $i) => $i->status() === 'over');
        $dead = $items->filter(fn (StockItem $i) => $i->status() === 'dead');

        $byWarehouse = $items->groupBy('warehouse')->map(fn ($group, $name) => [
            'warehouse' => $name ?: '—',
            'skus' => $group->count(),
            'units' => $group->sum('current_stock'),
            'value' => round($group->sum(fn (StockItem $i) => (float) $i->cost * $i->current_stock)),
        ])->values();

        $byCategory = $items->groupBy('category')->map(fn ($group, $name) => [
            'category' => $name ?: '—',
            'skus' => $group->count(),
            'units' => $group->sum('current_stock'),
        ])->sortByDesc('units')->values();

        return response()->json([
            'skus' => $items->count(),
            'total_units' => $items->sum('current_stock'),
            'total_value' => round($items->sum(fn (StockItem $i) => (float) $i->cost * $i->current_stock)),
            'out_count' => $out->count(),
            'low_count' => $low->count(),
            'over_count' => $over->count(),
            'dead_count' => $dead->count(),
            'out_items' => StockItemResource::collection($out->sortBy('name')->values()),
            'low_items' => StockItemResource::collection($low->sortBy('current_stock')->values()),
            'over_items' => StockItemResource::collection($over->sortByDesc(fn (StockItem $i) => $i->current_stock - $i->max_stock)->values()),
            'dead_items' => StockItemResource::collection($dead->values()),
            'by_warehouse' => $byWarehouse,
            'by_category' => $byCategory,
        ]);
    }

    /** Create a stock item. */
    public function store(StoreStockItemRequest $request): JsonResponse
    {
        $item = StockItem::create($request->validated());
        AuditLog::record('Created stock item', "{$item->sku} — {$item->name}");

        return (new StockItemResource($item))->response()->setStatusCode(201);
    }

    /** Show a single stock item. */
    public function show(Request $request, StockItem $stockItem): JsonResponse
    {
        $this->gateView($request);

        return (new StockItemResource($stockItem))->response();
    }

    /** Update a stock item. */
    public function update(StoreStockItemRequest $request, StockItem $stockItem): JsonResponse
    {
        $stockItem->update($request->validated());
        AuditLog::record('Updated stock item', "{$stockItem->sku} — {$stockItem->name}");

        return (new StockItemResource($stockItem))->response();
    }

    /** Delete a stock item (requires stock.delete). */
    public function destroy(Request $request, StockItem $stockItem): JsonResponse
    {
        abort_unless((bool) ($request->user()?->isSuper() || $request->user()?->hasPermission('stock.delete')), 403);
        AuditLog::record('Deleted stock item', "{$stockItem->sku} — {$stockItem->name}");
        $stockItem->delete();

        return response()->json(['message' => 'success']);
    }
}
