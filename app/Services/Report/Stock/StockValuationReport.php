<?php

namespace App\Services\Report\Stock;

use App\Models\Stock\StockBalance;
use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\DateDisplay;
use App\Support\SearchTerms;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * "มูลค่าคงคลัง" (Report Center → Stock): on-hand quantity × FIFO cost per SKU at the end of the chosen day, most
 * valuable first. breakdown() (StockValuationBreakdownController) feeds the tiles and the category, warehouse and dead-stock cards.
 */
class StockValuationReport extends TabularReport
{
    use StockColumns;

    private const NO_WAREHOUSE_TH = 'ไม่ระบุคลัง';

    /** @var array<string, Collection<int, array{item: StockItem, qty: int, value: float, last_move: ?Carbon}>> held items per day + category */
    private array $valued = [];

    /** @var array<string, array<string, mixed>> breakdown() per day + category */
    private array $breakdowns = [];

    public function key(): string
    {
        return 'stock.valuation';
    }

    public function title(): string
    {
        return 'มูลค่าคงคลัง';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('as_of', today()->toDateString()),
            ReportFilter::select('category_id', Options::categories()),
            ReportFilter::search(),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        $query = $this->atDay($filters, heldOnly: true)
            ->with(self::ITEM_RELATIONS)
            ->when($filters['search'], fn (Builder $q, string $search) => SearchTerms::apply($q, $search, ['sku', 'name']));

        // Most valuable first, ranked by the same qtyAt/valueAt the columns show.
        $ranks = $this->valuedItems($filters)->values()
            ->map(fn (array $row, int $rank) => 'WHEN '.(int) $row['item']->id.' THEN '.$rank)
            ->implode(' ');
        if ($ranks !== '') {
            $query->orderByRaw("CASE stock_items.id {$ranks} END");
        }

        return $query->orderBy('sku');
    }

    public function columns(): array
    {
        // Unit moves next to the quantity
        $item = $this->itemColumns(fn (StockItem $i) => $i);

        return [
            ...array_values(array_filter($item, fn (ReportColumn $c) => $c->key !== 'unit')),
            ReportColumn::number('qty_on_hand', 'คงเหลือ', fn (StockItem $i) => $this->qtyAt($i)),
            ...array_values(array_filter($item, fn (ReportColumn $c) => $c->key === 'unit')),
            ReportColumn::money('avg_cost', 'ต้นทุนเฉลี่ย', fn (StockItem $i) => round($this->valueAt($i) / $this->qtyAt($i), 2)),
            ReportColumn::money('stock_value', 'มูลค่าคงคลัง', fn (StockItem $i) => $this->valueAt($i)),
            ReportColumn::date('last_move', 'เคลื่อนไหวล่าสุด', fn (StockItem $i) => $this->lastMoveAt($i)),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        // Needs the lots on every item, so keep the eager loads (but not the name relations).
        $items = (clone $query)->without(['category', 'unit'])->get();

        return [
            ReportSummary::make('total', 'ทั้งหมด', $items->count()),
            ReportSummary::make('qty_total', 'จำนวนคงเหลือรวม', (int) $items->sum(fn (StockItem $i) => $this->qtyAt($i))),
            ReportSummary::make('stock_value', 'มูลค่าคงคลังรวม', round((float) $items->sum(fn (StockItem $i) => $this->valueAt($i)), 2), format: 'money'),
        ];
    }

    /**
     * What the page draws above the rows: day + category, never the search. Codes, numbers and stored names
     * only; warehouses is null for a past day (balances are current only).
     *
     * @param  array<string, mixed>  $filters
     * @return array{as_of: string, today: bool, tiles: array<string, mixed>, categories: list<array<string, mixed>>, warehouses: ?list<array<string, mixed>>, dead: list<array<string, mixed>>}
     */
    public function breakdown(?User $viewer, array $filters): array
    {
        return $this->breakdowns[$this->scopeKey($filters)] ??= $this->buildBreakdown($filters);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    private function buildBreakdown(array $filters): array
    {
        $day = Carbon::parse($filters['as_of'])->startOfDay();
        $isToday = $this->isToday($filters);
        $held = $this->valuedItems($filters);
        $items = $this->atDay($filters, heldOnly: false)->count();
        $dead = $held
            ->map(fn (array $row) => $row + ['days' => $row['last_move'] === null ? null : (int) $row['last_move']->copy()->startOfDay()->diffInDays($day)])
            ->filter(fn (array $row) => $row['days'] !== null && $row['days'] > StockItem::DEAD_STOCK_DAYS);

        return [
            'as_of' => $day->toDateString(),
            'today' => $isToday,
            'tiles' => [
                'value' => round((float) $held->sum('value'), 2),
                'qty' => (int) $held->sum('qty'),
                'held' => $held->count(),
                'items' => $items,
                'out' => $items - $held->count(),
                'dead90' => ['value' => round((float) $dead->sum('value'), 2), 'count' => $dead->count()],
            ],
            'categories' => self::categories($held),
            'warehouses' => $isToday ? self::warehouses($held) : null,
            'dead' => $dead->map(fn (array $row) => [
                'item_id' => $row['item']->id,
                'sku' => $row['item']->sku,
                'name' => $row['item']->name,
                'category' => $row['item']->category?->name,
                'category_th' => $row['item']->category?->name_th,
                'unit' => $row['item']->unit?->name,
                'qty' => $row['qty'],
                'value' => $row['value'],
                'last_move' => $row['last_move']->toDateString(),
                'days' => $row['days'],
            ])->values()->all(),
        ];
    }

    /**
     * Held items grouped by category, most valuable first.
     *
     * @param  Collection<int, array{item: StockItem, qty: int, value: float, last_move: ?Carbon}>  $held
     * @return list<array{category_id: ?int, name: ?string, name_th: ?string, items: int, qty: int, value: float}>
     */
    private static function categories(Collection $held): array
    {
        return $held->groupBy(fn (array $row) => (int) $row['item']->category_id)
            ->map(fn (Collection $group) => [
                'category_id' => $group->first()['item']->category_id,
                'name' => $group->first()['item']->category?->name,
                'name_th' => $group->first()['item']->category?->name_th,
                'items' => $group->count(),
                'qty' => (int) $group->sum('qty'),
                'value' => round((float) $group->sum('value'), 2),
            ])
            ->sortByDesc('value')->values()->all();
    }

    /**
     * Today's warehouse balances of the held items, each valued at its item's unit value (value ÷ qty).
     *
     * @param  Collection<int, array{item: StockItem, qty: int, value: float, last_move: ?Carbon}>  $held
     * @return list<array{warehouse_id: ?int, name: ?string, items: int, qty: int, value: float}>
     */
    private static function warehouses(Collection $held): array
    {
        $unitValue = $held->mapWithKeys(fn (array $row) => [$row['item']->id => $row['value'] / $row['qty']]);

        return StockBalance::query()
            ->with('warehouse:id,name')
            ->whereIn('stock_item_id', $unitValue->keys())
            ->where('qty', '>', 0)
            ->get()
            ->groupBy(fn (StockBalance $b) => (int) $b->warehouse_id)
            ->map(fn (Collection $group) => [
                'warehouse_id' => $group->first()->warehouse_id,
                'name' => $group->first()->warehouse?->name,
                'items' => $group->count(),
                'qty' => (int) $group->sum('qty'),
                'value' => round((float) $group->sum(fn (StockBalance $b) => $b->qty * $unitValue[$b->stock_item_id]), 2),
            ])
            ->sortByDesc('value')->values()->all();
    }

    /**
     * The cards as Excel sheets / PDF blocks, in the page's words; by warehouse only for today.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $data = $this->breakdown($viewer, $filters);
        // Each sheet's share is of its own total, as on the page.
        $shareOf = function (array $rows): Closure {
            $total = (float) array_sum(array_column($rows, 'value'));

            return fn (float $value) => $total > 0 ? round($value / $total * 100, 1) : 0.0;
        };
        $categoryShare = $shareOf($data['categories']);

        $sections = [[
            'title' => 'มูลค่าตามหมวด',
            'headings' => ['หมวด', 'รายการ', 'ชิ้น', 'มูลค่า', 'สัดส่วน (%)'],
            'rows' => array_map(fn (array $c) => [
                ($c['name_th'] ?: $c['name']) ?? '—', $c['items'], $c['qty'], $c['value'], $categoryShare($c['value']),
            ], $data['categories']),
        ]];

        if ($data['warehouses'] !== null) {
            $warehouseShare = $shareOf($data['warehouses']);
            $sections[] = [
                'title' => 'มูลค่าตามคลัง',
                'headings' => ['คลัง', 'รายการ', 'ชิ้น', 'มูลค่า', 'สัดส่วน (%)'],
                'rows' => array_map(fn (array $w) => [
                    $w['name'] ?? self::NO_WAREHOUSE_TH, $w['items'], $w['qty'], $w['value'], $warehouseShare($w['value']),
                ], $data['warehouses']),
            ];
        }

        $sections[] = [
            'title' => 'รายการที่ไม่เคลื่อนไหวเกิน 90 วัน',
            'headings' => ['SKU', 'รายการ', 'หมวด', 'คงเหลือ', 'หน่วย', 'มูลค่า', 'เคลื่อนไหวล่าสุด', 'ไม่เคลื่อนไหว (วัน)'],
            'rows' => array_map(fn (array $d) => [
                $d['sku'], $d['name'], ($d['category_th'] ?: $d['category']) ?? '—', $d['qty'], $d['unit'],
                $d['value'], DateDisplay::date($d['last_move']), $d['days'],
            ], $data['dead']),
        ];

        return $sections;
    }

    /**
     * Held items with their quantity, value and last move at the day, most valuable first (sku breaks ties).
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array{item: StockItem, qty: int, value: float, last_move: ?Carbon}>
     */
    private function valuedItems(array $filters): Collection
    {
        return $this->valued[$this->scopeKey($filters)] ??= $this->atDay($filters, heldOnly: true)
            ->with(self::ITEM_RELATIONS)
            ->get()
            ->map(fn (StockItem $item) => [
                'item' => $item,
                'qty' => $this->qtyAt($item),
                'value' => $this->valueAt($item),
                'last_move' => $this->lastMoveAt($item),
            ])
            ->sort(fn (array $a, array $b) => [$b['value'], $a['item']->sku] <=> [$a['value'], $b['item']->sku])
            ->values();
    }

    /**
     * Items in scope (day + category) carrying what qtyAt / valueAt / lastMoveAt read at that day.
     *
     * @param  array<string, mixed>  $filters
     */
    private function atDay(array $filters, bool $heldOnly): Builder
    {
        $asOf = Carbon::parse($filters['as_of'])->endOfDay();
        $isCurrent = $this->isToday($filters);
        $movedAfter = $this->netMovedAfter($asOf);

        $query = StockItem::query()
            ->select('stock_items.*')
            ->selectSub($movedAfter, 'moved_after')
            ->selectRaw('? as valued_current', [$isCurrent ? 1 : 0])
            ->with([
                'lots' => $isCurrent
                    ? fn ($q) => $q->where('qty_remaining', '>', 0)
                    : fn ($q) => $q->where('received_at', '<=', $asOf)->orderByDesc('received_at')->orderByDesc('id'),
            ])
            ->when($filters['category_id'], fn (Builder $q, $id) => $q->where('category_id', (int) $id));

        // Last move at the day: the item's own stamp today, else the ledger up to that day.
        if ($isCurrent) {
            $query->selectRaw('stock_items.last_move_at as last_move_on');
        } else {
            $query->selectSub(
                StockMovement::query()->selectRaw('MAX(moved_at)')->whereColumn('stock_movements.stock_item_id', 'stock_items.id')->where('moved_at', '<=', $asOf),
                'last_move_on',
            );
        }

        if ($heldOnly) {
            $query->whereRaw('stock_items.current_stock - ('.$movedAfter->toSql().') > 0', $movedAfter->getBindings());
        }

        return $query;
    }

    /** @param array<string, mixed> $filters */
    private function isToday(array $filters): bool
    {
        return Carbon::parse($filters['as_of'])->endOfDay()->gte(today()->endOfDay());
    }

    /** @param array<string, mixed> $filters */
    private function scopeKey(array $filters): string
    {
        return md5(serialize([$filters['as_of'] ?? null, $filters['category_id'] ?? null]));
    }

    /**
     * Net stock change (inbound − outbound) of an item's movements after $asOf, as a
     * correlated subquery on stock_items. Transfers only move stock between warehouses.
     */
    private function netMovedAfter(Carbon $asOf): Builder
    {
        $inbound = implode(', ', array_map(fn (string $type) => "'{$type}'", StockMovement::INBOUND));

        return StockMovement::query()
            ->selectRaw("COALESCE(SUM(CASE WHEN type IN ({$inbound}) THEN qty WHEN type = 'transfer' THEN 0 ELSE -qty END), 0)")
            ->whereColumn('stock_movements.stock_item_id', 'stock_items.id')
            ->where('moved_at', '>', $asOf);
    }

    private function qtyAt(StockItem $item): int
    {
        return $item->current_stock - (int) $item->moved_after;
    }

    // Today = the open lots; a past day = lots received by then, newest first, the rest at the oldest lot's or item cost.
    private function valueAt(StockItem $item): float
    {
        if ((bool) $item->valued_current) {
            return round($item->stockValue(), 2);
        }

        $needed = $this->qtyAt($item);
        $value = 0.0;
        foreach ($item->lots as $lot) {
            if ($needed <= 0) {
                break;
            }
            $taken = min($needed, $lot->qty_received);
            $value += $taken * (float) $lot->unit_cost;
            $needed -= $taken;
        }

        if ($needed > 0) {
            /** @var StockLot|null $oldest */
            $oldest = $item->lots->last();
            $value += $needed * (float) ($oldest?->unit_cost ?? $item->cost);
        }

        return round($value, 2);
    }

    private function lastMoveAt(StockItem $item): ?Carbon
    {
        return $item->last_move_on === null ? null : Carbon::parse($item->last_move_on);
    }
}
