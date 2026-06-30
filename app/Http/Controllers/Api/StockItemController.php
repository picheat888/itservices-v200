<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreStockItemRequest;
use App\Http\Resources\StockItemResource;
use App\Models\AppSetting;
use App\Models\AuditLog;
use App\Models\StockBalance;
use App\Models\StockItem;
use App\Models\StockItemSerial;
use App\Models\StockLot;
use App\Support\DocumentName;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\StreamedResponse;

class StockItemController extends Controller
{
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

    /**
     * Server-paginated stock item list with search, category/warehouse/status filters
     * and sorting. Status is derived but maps to DB columns, so it filters in SQL via
     * StockItem::scopeWithDerivedStatus() — letting pagination happen at the database.
     */
    public function index(Request $request): JsonResponse
    {
        $this->gateView($request);

        $query = StockItem::query()
            ->select('stock_items.*')
            ->with(['lots', 'balances'])
            // Reserved = qty committed by approved-but-unfulfilled requests (not yet
            // deducted from on-hand). Used to show "available to request" in New Request.
            ->withSum(['requests as reserved_qty' => fn ($q) => $q->where('status', 'approved')], 'qty')
            // FIFO stock value as a subquery column so we can sort by it at the DB.
            ->addSelect(['value_total' => StockLot::query()
                ->selectRaw('COALESCE(SUM(qty_remaining * unit_cost), 0)')
                ->whereColumn('stock_item_id', 'stock_items.id')]);

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
            // Warehouse is no longer a SKU attribute — filter by where stock
            // actually sits (per-warehouse balances).
            $warehouse = $request->query('warehouse');
            $query->whereHas('balances', fn ($q) => $q->where('warehouse', $warehouse));
        }
        if ($request->filled('status')) {
            $query->withDerivedStatus($request->query('status'));
        }

        match ($request->query('sort', 'name_asc')) {
            'name_desc' => $query->orderBy('name', 'desc'),
            'stock_desc' => $query->orderBy('current_stock', 'desc'),
            'stock_asc' => $query->orderBy('current_stock', 'asc'),
            'value_desc' => $query->orderBy('value_total', 'desc'),
            'value_asc' => $query->orderBy('value_total', 'asc'),
            default => $query->orderBy('name', 'asc'),
        };

        // `all=1` returns the full (filtered) list — used by item pickers/drawers,
        // which are selectors, not paginated tables.
        if ($request->boolean('all')) {
            $items = $query->get();

            return response()->json([
                'data' => StockItemResource::collection($items),
                'meta' => ['total' => $items->count()],
            ]);
        }

        $perPage = max(10, min(100, (int) $request->query('per_page', 20)));
        $paginator = $query->paginate($perPage);

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

    /**
     * Dashboard aggregates: SKU/unit/value totals, min-max alert buckets
     * (low/out, overstock, dead stock), and per-warehouse / per-category breakdowns.
     */
    public function summary(Request $request): JsonResponse
    {
        $this->gateDashboard($request);

        $items = StockItem::with(['lots', 'balances'])->get();

        $out = $items->filter(fn (StockItem $i) => $i->status() === 'out');
        $low = $items->filter(fn (StockItem $i) => $i->status() === 'low');
        $over = $items->filter(fn (StockItem $i) => $i->status() === 'over');
        $dead = $items->filter(fn (StockItem $i) => $i->status() === 'dead');

        // Aggregate per-warehouse totals from stock_balances so that items
        // split across multiple warehouses are counted accurately.
        // Per-warehouse cost (value) is out of scope for FIFO lot costing.
        $byWarehouse = StockBalance::query()
            ->selectRaw('warehouse, COUNT(DISTINCT stock_item_id) as skus, SUM(qty) as units')
            ->groupBy('warehouse')
            ->get()
            ->map(fn ($row) => [
                'warehouse' => $row->warehouse ?: '—',
                'skus' => (int) $row->skus,
                'units' => (int) $row->units,
            ])
            ->values();

        $byCategory = $items->groupBy('category')->map(fn ($group, $name) => [
            'category' => $name ?: '—',
            'skus' => $group->count(),
            'units' => $group->sum('current_stock'),
        ])->sortByDesc('units')->values();

        return response()->json([
            'skus' => $items->count(),
            'total_units' => $items->sum('current_stock'),
            'total_value' => round($items->sum(fn (StockItem $i) => $i->stockValue())),
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

    /** Flat list of every serial known to the system — used by the receive
     *  drawer to flag duplicates live as the user captures serials. */
    public function serials(Request $request): JsonResponse
    {
        $this->gateView($request);

        return response()->json(['data' => StockItemSerial::orderBy('serial')->pluck('serial')]);
    }

    /** Create a stock item with an auto-generated running SKU (SKU-#######). */
    public function store(StoreStockItemRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['sku'] = StockItem::nextSku();
        $item = StockItem::create($data);
        AuditLog::record('Created stock item', "{$item->sku} — {$item->name}");

        return (new StockItemResource($item))->response()->setStatusCode(201);
    }

    /** Show a single stock item, including every per-unit serial registered to it. */
    public function show(Request $request, StockItem $stockItem): JsonResponse
    {
        $this->gateView($request);

        $stockItem->load([
            'lots' => fn ($q) => $q->with('movement')->orderBy('received_at')->orderBy('id'),
            'serials' => fn ($q) => $q->orderBy('serial'),
            'balances' => fn ($q) => $q->orderBy('warehouse'),
        ]);

        return (new StockItemResource($stockItem))->response();
    }

    /** Full audit history for one SKU: movement timeline + lots + per-serial event timelines. */
    public function history(Request $request, StockItem $stockItem): JsonResponse
    {
        $this->gateView($request);

        return response()->json(['data' => $this->buildHistory($stockItem)]);
    }

    /** Stream an A4 PDF of one history view (summary|issue|receive|adjust|transfer). */
    public function historyPdf(Request $request, StockItem $stockItem): StreamedResponse
    {
        $this->gateView($request);

        $view = $request->query('v', 'summary');
        if (! in_array($view, ['summary', 'issue', 'receive', 'adjust', 'transfer'], true)) {
            $view = 'summary';
        }

        // Pure nested arrays for the Blade (no Collection surprises in array_filter, etc.).
        $history = json_decode(json_encode($this->buildHistory($stockItem)), true);

        // Logo → base64 data URI so dompdf needs no remote/chroot access for the image.
        $logo = null;
        $logoPath = AppSetting::get('logo_path');
        if ($logoPath && Storage::disk('public')->exists($logoPath)) {
            $logo = 'data:'.Storage::disk('public')->mimeType($logoPath).';base64,'.base64_encode(Storage::disk('public')->get($logoPath));
        }

        $pdf = Pdf::loadView('pdf.stock-history', [
            'history' => $history,
            'view' => $view,
            'logo' => $logo,
            'company' => AppSetting::get('company_name', 'ABCD Electric Company'),
            'legalName' => AppSetting::get('legal_name'),
            'address' => AppSetting::get('address'),
            'taxId' => AppSetting::get('tax_id'),
            'printedBy' => $request->user()?->name ?? '',
            'printedAt' => now()->format('Y-m-d H:i'),
        ])->setPaper('a4', $view === 'summary' ? 'portrait' : 'landscape');

        // dompdf v3's own stream() returns a buffered Illuminate Response; the tests read the
        // body via streamedContent(), so wrap the rendered bytes in a real StreamedResponse.
        $bytes = $pdf->output();
        // Standard system-wide filename: StockHistory_<View>_<SKU>_<YYYY-MM-DD>.pdf.
        $filename = DocumentName::make('StockHistory', [ucfirst($view), $stockItem->sku]);

        return new StreamedResponse(function () use ($bytes) {
            echo $bytes;
        }, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => HeaderUtils::makeDisposition('inline', $filename, 'history.pdf'),
        ]);
    }

    /**
     * Assemble the full audit history for one SKU: movement timeline, FIFO lots, and
     * per-serial event timelines. Shared by the JSON endpoint and the PDF export.
     *
     * @return array<string, mixed>
     */
    private function buildHistory(StockItem $stockItem): array
    {
        $stockItem->load([
            'movements',
            'lots' => fn ($q) => $q->latest('received_at'),
            'lots.movement',
            'serials.events.movement',
        ]);

        $lotSerials = $stockItem->serials->groupBy('stock_movement_id');

        return [
            'item' => [
                'id' => $stockItem->id,
                'sku' => $stockItem->sku,
                'name' => $stockItem->name,
                'current_stock' => $stockItem->current_stock,
                'track_serial' => (bool) $stockItem->track_serial,
            ],
            'movements' => $stockItem->movements->map(fn ($m) => [
                'id' => $m->id,
                'doc_no' => $m->doc_no,
                'type' => $m->type,
                'qty' => $m->qty,
                'unit_cost' => $m->unit_cost,
                'from_label' => $m->from_label,
                'to_label' => $m->to_label,
                'reference' => $m->reference,
                'recorded_by' => $m->recorded_by,
                'notes' => $m->notes,
                'moved_at' => $m->moved_at?->toIso8601String(),
            ])->values(),
            'lots' => $stockItem->lots->map(fn ($l) => [
                'unit_cost' => $l->unit_cost,
                'qty_received' => $l->qty_received,
                'qty_remaining' => $l->qty_remaining,
                'received_at' => $l->received_at?->toIso8601String(),
                'doc_no' => $l->movement?->doc_no,
                'serials' => ($lotSerials[$l->stock_movement_id] ?? collect())->pluck('serial')->values(),
            ])->values(),
            'serials' => $stockItem->serials->map(fn ($s) => [
                'serial' => $s->serial,
                'status' => $s->status,
                'warehouse' => $s->warehouse,
                'events' => $s->events->map(fn ($e) => [
                    'event' => $e->event,
                    'occurred_at' => $e->occurred_at?->toIso8601String(),
                    'doc_no' => $e->movement?->doc_no,
                    'reference' => $e->reference,
                    'recorded_by' => $e->recorded_by,
                    'from_label' => $e->from_label,
                    'to_label' => $e->to_label,
                ])->values(),
            ])->values(),
        ];
    }

    /** Update a stock item. */
    public function update(StoreStockItemRequest $request, StockItem $stockItem): JsonResponse
    {
        $before = $stockItem->getOriginal();
        $stockItem->update($request->validated());
        AuditLog::record('Updated stock item', "{$stockItem->sku} — {$stockItem->name}", AuditLog::changes($before, $stockItem));

        return (new StockItemResource($stockItem))->response();
    }

    /** Delete a stock item (requires stock.delete). Only an empty SKU — zero
     *  on-hand and zero FIFO value — may be removed, so stock or lot value is
     *  never lost by a delete. The UI mirrors this; this is the safety net. */
    public function destroy(Request $request, StockItem $stockItem): JsonResponse
    {
        abort_unless((bool) ($request->user()?->isSuper() || $request->user()?->hasPermission('stock.delete')), 403);

        if ($stockItem->current_stock !== 0 || $stockItem->stockValue() > 0) {
            return response()->json(['message' => 'Cannot delete: item still has stock or value.'], 422);
        }

        AuditLog::record('Deleted stock item', "{$stockItem->sku} — {$stockItem->name}");
        $stockItem->delete();

        return response()->json(['message' => 'success']);
    }
}
