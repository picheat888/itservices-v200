<?php

namespace App\Services\Report\Stock;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockLot;
use App\Models\Stock\StockMovement;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use App\Support\SearchTerms;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * "ต่ำกว่าขั้นต่ำและเกินขั้นสูง" (Report Center → Stock): every SKU out of stock, below its Min or above its Max, with
 * what to reorder or what sits above Max and its value. breakdown() (StockLevelsBreakdownController) feeds the tiles and the category card.
 */
class StockBelowMinReport extends TabularReport
{
    use StockColumns;

    private const STATUS_KEYS = ['out' => 'stock_st_out', 'low' => 'stock_st_low', 'over' => 'stock_st_over'];

    private const STATUS_TH = ['out' => 'หมดสต็อก', 'low' => 'ต่ำกว่า Min', 'over' => 'เกิน Max'];

    private const BASIS_KEYS = [
        'last_receipt' => 'rep_opt_basis_last_receipt', 'item_cost' => 'rep_opt_basis_item_cost',
        'average' => 'rep_opt_basis_average', 'none' => 'rep_opt_basis_none',
    ];

    private const BASIS_TH = ['last_receipt' => 'ราคารับเข้าล่าสุด', 'item_cost' => 'ต้นทุนที่ตั้งไว้', 'average' => 'ต้นทุนเฉลี่ย', 'none' => 'ไม่มีราคา'];

    private const KIND_KEYS = ['reorder' => 'rep_opt_value_reorder', 'excess' => 'rep_opt_value_excess'];

    private const KIND_TH = ['reorder' => 'ที่ควรสั่ง', 'excess' => 'ส่วนที่เกิน Max'];

    private const STATUS_ORDER = ['out' => 0, 'low' => 1, 'over' => 2];

    /** @var array<string, Collection<int, array<string, mixed>>> scoped rows per category */
    private array $levels = [];

    /** @var array<string, array<string, mixed>> breakdown() per category */
    private array $breakdowns = [];

    public function key(): string
    {
        return 'stock.below_min';
    }

    public function title(): string
    {
        return 'ต่ำกว่าขั้นต่ำและเกินขั้นสูง';
    }

    public function filters(): array
    {
        return [
            ReportFilter::select('status', Options::fromLabels(self::STATUS_KEYS)),
            ReportFilter::select('category_id', Options::categories()),
            ReportFilter::search(),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        $query = $this->scoped($filters)
            ->with(self::ITEM_RELATIONS)
            ->when($filters['status'], fn (Builder $q, string $status) => $q->withDerivedStatus($status))
            ->when($filters['search'], fn (Builder $q, string $search) => SearchTerms::apply($q, $search, ['sku', 'name']));

        // Status order, then the same ranking the cards use (shortfall ratio, excess value).
        $ranks = $this->levelRows($filters)
            ->map(fn (array $row, int $rank) => 'WHEN '.(int) $row['item']->id.' THEN '.$rank)
            ->implode(' ');
        if ($ranks !== '') {
            $query->orderByRaw("CASE stock_items.id {$ranks} END");
        }

        return $query->orderBy('sku');
    }

    public function columns(): array
    {
        return [
            ...$this->itemColumns(fn (StockItem $i) => $i),
            ReportColumn::enum('status', 'สถานะ', fn (StockItem $i) => $i->status(), self::STATUS_KEYS, self::STATUS_TH),
            ReportColumn::number('qty_on_hand', 'คงเหลือ', fn (StockItem $i) => $i->current_stock),
            ReportColumn::number('min_stock', 'Min', fn (StockItem $i) => $i->min_stock),
            ReportColumn::number('max_stock', 'Max', fn (StockItem $i) => $i->max_stock),
            ReportColumn::number('gap', 'ขาด / เกิน', fn (StockItem $i) => self::figures($i)['gap']),
            ReportColumn::number('reorder_qty', 'ควรสั่ง', fn (StockItem $i) => self::figures($i)['reorder_qty']),
            ReportColumn::money('unit_cost', 'ราคาต่อหน่วย', fn (StockItem $i) => self::rounded(self::figures($i)['unit_cost'])),
            ReportColumn::enum('unit_cost_basis', 'ที่มาของราคา', fn (StockItem $i) => self::figures($i)['basis'], self::BASIS_KEYS, self::BASIS_TH)
                ->hiddenByDefault(),
            ReportColumn::money('value', 'มูลค่า', fn (StockItem $i) => self::rounded(self::figures($i)['value'])),
            ReportColumn::enum('value_kind', 'ชนิดมูลค่า', fn (StockItem $i) => self::figures($i)['kind'], self::KIND_KEYS, self::KIND_TH)
                ->hiddenByDefault(),
            ReportColumn::date('last_move', 'เคลื่อนไหวล่าสุด', fn (StockItem $i) => $i->last_move_at),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $tiles = $this->breakdown(null, $filters)['tiles'];

        return [
            ReportSummary::make('out_of_stock', 'หมดสต็อก', $tiles['out'], 'red'),
            ReportSummary::make('below_min', 'ต่ำกว่า Min', $tiles['low'], 'amber'),
            ReportSummary::make('over_max', 'เกิน Max', $tiles['over']),
            ReportSummary::make('reorder_value', 'มูลค่าที่ควรสั่ง', $tiles['reorder']['value'], format: 'money'),
            ReportSummary::make('excess_value', 'มูลค่าส่วนที่เกิน Max', $tiles['excess_value'], format: 'money'),
        ];
    }

    /**
     * What the page draws above and below the rows: category only, never the status or the search. Codes, numbers
     * and stored names only.
     *
     * @param  array<string, mixed>  $filters
     * @return array{tiles: array<string, mixed>, categories: list<array<string, mixed>>}
     */
    public function breakdown(?User $viewer, array $filters): array
    {
        return $this->breakdowns[$this->scopeKey($filters)] ??= $this->buildBreakdown($filters);
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{tiles: array<string, mixed>, categories: list<array<string, mixed>>}
     */
    private function buildBreakdown(array $filters): array
    {
        $rows = $this->levelRows($filters);
        $of = fn (string $status) => $rows->where('status', $status);
        $needs = $rows->whereIn('status', ['out', 'low']);

        return [
            'tiles' => [
                'items_total' => StockItem::query()
                    ->when($filters['category_id'] ?? null, fn (Builder $q, $id) => $q->where('category_id', (int) $id))
                    ->count(),
                'out' => $of('out')->count(),
                'low' => $of('low')->count(),
                'over' => $of('over')->count(),
                'low_gap' => (int) $of('low')->sum('gap'),
                'over_excess' => (int) $of('over')->sum('gap'),
                'reorder' => ['value' => round((float) $needs->sum('value'), 2), 'items' => $needs->count()],
                'excess_value' => round((float) $of('over')->sum('value'), 2),
            ],
            'categories' => self::categories($rows),
        ];
    }

    /**
     * Out / low / over counts per category, most items first (name breaks ties).
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return list<array{category_id: ?int, name: ?string, name_th: ?string, out: int, low: int, over: int}>
     */
    private static function categories(Collection $rows): array
    {
        return $rows->groupBy(fn (array $row) => (int) $row['item']->category_id)
            ->map(fn (Collection $group) => [
                'category_id' => $group->first()['item']->category_id,
                'name' => $group->first()['item']->category?->name,
                'name_th' => $group->first()['item']->category?->name_th,
                'out' => $group->where('status', 'out')->count(),
                'low' => $group->where('status', 'low')->count(),
                'over' => $group->where('status', 'over')->count(),
            ])
            ->sort(fn (array $a, array $b) => [$b['out'] + $b['low'] + $b['over'], (string) $a['name']] <=> [$a['out'] + $a['low'] + $a['over'], (string) $b['name']])
            ->values()->all();
    }

    /**
     * The category card as an Excel sheet / PDF block, in the page's words.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        $data = $this->breakdown($viewer, $filters);

        return [[
            'title' => 'ตามหมวด',
            'headings' => ['หมวด', 'หมดสต็อก', 'ต่ำกว่า Min', 'เกิน Max', 'รวม'],
            'rows' => array_map(fn (array $c) => [
                ($c['name_th'] ?: $c['name']) ?? '—', $c['out'], $c['low'], $c['over'], $c['out'] + $c['low'] + $c['over'],
            ], $data['categories']),
        ]];
    }

    /**
     * Scoped items with their figures, in page order: out, low by shortfall ratio, over by excess value, then SKU.
     *
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array<string, mixed>>
     */
    private function levelRows(array $filters): Collection
    {
        return $this->levels[$this->scopeKey($filters)] ??= $this->scoped($filters)
            ->with(self::ITEM_RELATIONS)
            ->get()
            ->map(fn (StockItem $item) => ['item' => $item] + self::figures($item))
            ->sort(fn (array $a, array $b) => [self::STATUS_ORDER[$a['status']], -self::rank($a), $a['item']->sku]
                <=> [self::STATUS_ORDER[$b['status']], -self::rank($b), $b['item']->sku])
            ->values();
    }

    /**
     * Items out (0), below a set Min or above Max, in the category, carrying the last receipt price and open lot value.
     *
     * @param  array<string, mixed>  $filters
     */
    private function scoped(array $filters): Builder
    {
        $lastReceiptCost = StockMovement::query()
            ->select('unit_cost')
            ->whereColumn('stock_movements.stock_item_id', 'stock_items.id')
            ->where('type', 'receive')
            ->whereNotNull('unit_cost')
            ->orderByDesc('moved_at')
            ->orderByDesc('id')
            ->limit(1);

        $openLotValue = StockLot::query()
            ->selectRaw('COALESCE(SUM(qty_remaining * unit_cost), 0)')
            ->whereColumn('stock_lots.stock_item_id', 'stock_items.id')
            ->where('qty_remaining', '>', 0);

        return StockItem::query()
            ->select('stock_items.*')
            ->selectSub($lastReceiptCost, 'last_unit_cost')
            ->selectSub($openLotValue, 'value_total')
            ->where(fn (Builder $q) => $q->where('current_stock', 0)
                ->orWhere(fn (Builder $low) => $low->where('min_stock', '>', 0)->whereColumn('current_stock', '<', 'min_stock'))
                ->orWhereColumn('current_stock', '>', 'max_stock'))
            ->when($filters['category_id'] ?? null, fn (Builder $q, $id) => $q->where('category_id', (int) $id));
    }

    /**
     * One row's figures; unit_cost and value unrounded so the tiles sum before rounding.
     *
     * @return array{status: string, gap: int, reorder_qty: int, unit_cost: ?float, basis: string, value: ?float, kind: string}
     */
    private static function figures(StockItem $item): array
    {
        $status = $item->status();
        $current = $item->current_stock;
        [$unitCost, $basis] = self::unitCost($item);

        if ($status === 'over') {
            $lotValue = $item->stockValue();
            if ($current > 0 && $lotValue > 0) {
                [$unitCost, $basis] = [$lotValue / $current, 'average'];
            }
            $excess = $current - $item->max_stock;

            return [
                'status' => $status, 'gap' => $excess, 'reorder_qty' => 0, 'unit_cost' => $unitCost, 'basis' => $basis,
                'value' => $unitCost === null ? null : $excess * $unitCost, 'kind' => 'excess',
            ];
        }

        $reorder = max($item->max_stock, $item->min_stock) - $current;

        return [
            'status' => $status, 'gap' => $item->min_stock - $current, 'reorder_qty' => $reorder, 'unit_cost' => $unitCost,
            'basis' => $basis, 'value' => $unitCost === null ? null : $reorder * $unitCost, 'kind' => 'reorder',
        ];
    }

    /**
     * Last receipt price, else the item's recorded cost; null (basis none) when neither is above zero.
     *
     * @return array{0: ?float, 1: string}
     */
    private static function unitCost(StockItem $item): array
    {
        $lastReceipt = $item->getAttribute('last_unit_cost');
        $cost = (float) ($lastReceipt ?? $item->cost);

        if ($cost <= 0) {
            return [null, 'none'];
        }

        return [$cost, $lastReceipt !== null ? 'last_receipt' : 'item_cost'];
    }

    /** @param array<string, mixed> $row */
    private static function rank(array $row): float
    {
        if ($row['status'] === 'over') {
            return (float) ($row['value'] ?? 0);
        }

        return $row['gap'] / max(1, $row['item']->min_stock);
    }

    private static function rounded(?float $value): ?float
    {
        return $value === null ? null : round($value, 2);
    }

    /** @param array<string, mixed> $filters */
    private function scopeKey(array $filters): string
    {
        return md5(serialize([$filters['category_id'] ?? null]));
    }
}
