<?php

// The stock item list (search, filters, sort, FIFO value, reserved qty), one item's full load, and the dashboard summary.

namespace App\Services\Stock;

use App\Models\Stock\StockBalance;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\User;
use App\Support\SearchTerms;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

class StockItemListService
{
    /**
     * The filtered, sorted list; status is derived but filters in SQL (StockItem::scopeWithDerivedStatus).
     *
     * @param  array{search: mixed, category: ?string, warehouse: ?string, status: ?string, sort: mixed}  $filters
     * @return Builder<StockItem>
     */
    public function query(array $filters): Builder
    {
        $query = StockItem::query()
            ->select('stock_items.*')
            ->with(['balances.warehouse', 'unit', 'warrantyType', 'brand', 'model', 'category', 'draftCountLines.count:id,reference,warehouse'])
            ->withExists(['movements as has_movements', 'serials as has_serials'])
            // Reserved = qty held by approved-but-unfulfilled requests
            ->withSum(['requests as reserved_qty' => fn ($q) => $q->where('status', 'approved')], 'qty')
            // FIFO stock value as a sortable subquery column
            ->addSelect(['value_total' => StockLot::query()
                ->selectRaw('COALESCE(SUM(qty_remaining * unit_cost), 0)')
                ->whereColumn('stock_item_id', 'stock_items.id')]);

        SearchTerms::apply($query, $filters['search'], [
            'stock_items.name', 'stock_items.sku',
            SearchTerms::related('brand', ['name']),
            SearchTerms::related('model', ['name']),
        ]);
        if ($filters['category'] !== null) {
            $query->whereHas('category', fn ($c) => $c->where('name', $filters['category']));
        }
        if ($filters['warehouse'] !== null) {
            // Where stock sits (per-warehouse balances)
            $warehouse = $filters['warehouse'];
            $query->whereHas('balances', fn ($q) => $q->whereHas('warehouse', fn ($w) => $w->where('name', $warehouse)));
        }
        if ($filters['status'] !== null) {
            $query->withDerivedStatus($filters['status']);
        }

        match ($filters['sort']) {
            'name_desc' => $query->orderBy('name', 'desc'),
            'stock_desc' => $query->orderBy('current_stock', 'desc'),
            'stock_asc' => $query->orderBy('current_stock', 'asc'),
            'value_desc' => $query->orderBy('value_total', 'desc'),
            'value_asc' => $query->orderBy('value_total', 'asc'),
            default => $query->orderBy('name', 'asc'),
        };
        // Tie-breaker so equal values never swap or repeat across pages
        $query->orderBy('stock_items.id');

        return $query;
    }

    /** @param  array{search: mixed, category: ?string, warehouse: ?string, status: ?string, sort: mixed}  $filters */
    public function page(array $filters, int $perPage): LengthAwarePaginator
    {
        return $this->query($filters)->paginate($perPage);
    }

    /**
     * @param  array{search: mixed, category: ?string, warehouse: ?string, status: ?string, sort: mixed}  $filters
     * @return Collection<int, StockItem>
     */
    public function all(array $filters): Collection
    {
        return $this->query($filters)->get();
    }

    /** One item with lots (issued / returned sums), serials, balances and stamps, plus the reserved qty. */
    public function loadDetail(StockItem $item): StockItem
    {
        $item->load([
            'lots' => fn ($q) => $q->with(['movement.user.employee:id,first_name_th,last_name_th', 'warehouse'])
                ->withSum(['entries as issued_sum' => fn ($e) => $e->whereHas('movement', fn ($m) => $m->where('type', 'issue'))], 'qty')
                ->withSum(['entries as returned_sum' => fn ($e) => $e->whereHas('movement', fn ($m) => $m->where('type', 'return'))], 'qty')
                ->orderBy('received_at')
                ->orderBy('id'),
            'serials' => fn ($q) => $q->with('warehouse')->orderBy('serial'),
            'balances' => fn ($q) => $q->with('warehouse')->orderBy('warehouse_id'),
            'unit',
            'warrantyType',
            'brand',
            'model',
            'category',
            'creator.employee',
            'updater.employee',
            'draftCountLines.count:id,reference,warehouse',
        ]);

        return $this->withReserved($item);
    }

    /** The reserved qty and the has-moved / has-serials flags, as the list loads them. */
    public function withReserved(StockItem $item): StockItem
    {
        return $item->loadSum(['requests as reserved_qty' => fn ($q) => $q->where('status', 'approved')], 'qty')
            ->loadExists(['movements as has_movements', 'serials as has_serials']);
    }

    /**
     * Dashboard figures: totals, min-max buckets, reorder lists, per-warehouse and per-category, and recent movements for event readers.
     *
     * @return array<string, mixed> out_items, low_items and recent_movements (null without the event right) are collections the controller wraps
     */
    public function summary(?User $user): array
    {
        $items = StockItem::with(['lots', 'balances', 'category'])->get();

        $out = $items->filter(fn (StockItem $i) => $i->status() === 'out');
        $low = $items->filter(fn (StockItem $i) => $i->status() === 'low');
        $over = $items->filter(fn (StockItem $i) => $i->status() === 'over');
        $dead = $items->filter(fn (StockItem $i) => $i->status() === 'dead');

        // The reorder lists show warehouse names; load them once for out/low items only
        $out->concat($low)->load('balances.warehouse');

        // Per-warehouse totals from stock_balances, so a split item counts in each
        $byWarehouse = StockBalance::query()
            ->leftJoin('warehouses', 'warehouses.id', '=', 'stock_balances.warehouse_id')
            ->selectRaw('warehouses.name as warehouse, COUNT(DISTINCT stock_item_id) as skus, SUM(qty) as units')
            ->groupBy('warehouses.name')
            ->get()
            ->map(fn ($row) => [
                'warehouse' => $row->warehouse ?: 'Unassigned',
                'skus' => (int) $row->skus,
                'units' => (int) $row->units,
            ])
            ->values();

        $byCategory = $items->groupBy(fn (StockItem $i) => $i->category?->name)->map(fn ($group, $name) => [
            'category' => $name ?: '—',
            'category_th' => $group->first()->category?->name_th,
            'skus' => $group->count(),
            'units' => $group->sum('current_stock'),
        ])->sortByDesc('units')->values();

        // In the same request as every other panel; only event-log readers get rows
        $recentMovements = $user?->hasPermission('stock.view_events')
            ? StockMovement::with('item')->orderByDesc('moved_at')->orderByDesc('id')->limit(10)->get()
            : null;

        return [
            'skus' => $items->count(),
            'total_units' => $items->sum('current_stock'),
            'total_value' => round($items->sum(fn (StockItem $i) => $i->stockValue()), 2),
            'out_count' => $out->count(),
            'low_count' => $low->count(),
            'over_count' => $over->count(),
            'dead_count' => $dead->count(),
            'out_items' => $out->sortBy('name')->values(),
            'low_items' => $low->sortBy('current_stock')->values(),
            'by_warehouse' => $byWarehouse,
            'by_category' => $byCategory,
            'recent_movements' => $recentMovements,
        ];
    }
}
