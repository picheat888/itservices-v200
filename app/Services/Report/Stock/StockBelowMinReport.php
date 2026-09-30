<?php

namespace App\Services\Report\Stock;

use App\Models\Stock\StockItem;
use App\Models\Stock\StockMovement;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;

/**
 * "อะไหล่ต่ำกว่าขั้นต่ำ" (Report Center → Stock): the reorder list — every SKU with a minimum
 * set whose on-hand quantity has fallen below it (out of stock included), biggest shortfall
 * first, with how many to order to refill to max and roughly what that costs at the last
 * receipt price.
 */
class StockBelowMinReport extends TabularReport
{
    use StockColumns;

    private const STATUS_KEYS = ['out' => 'stock_st_out', 'low' => 'stock_st_low'];

    private const STATUS_TH = ['out' => 'หมดสต็อก', 'low' => 'ต่ำกว่า Min'];

    public function key(): string
    {
        return 'stock.below_min';
    }

    public function title(): string
    {
        return 'อะไหล่ต่ำกว่าขั้นต่ำ';
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
        $lastReceiptCost = StockMovement::query()
            ->select('unit_cost')
            ->whereColumn('stock_movements.stock_item_id', 'stock_items.id')
            ->where('type', 'receive')
            ->whereNotNull('unit_cost')
            ->orderByDesc('moved_at')
            ->orderByDesc('id')
            ->limit(1);

        return StockItem::query()
            ->select('stock_items.*')
            ->selectSub($lastReceiptCost, 'last_unit_cost')
            ->with(self::ITEM_RELATIONS)
            ->where('min_stock', '>', 0)
            ->whereColumn('current_stock', '<', 'min_stock')
            ->when($filters['status'], fn (Builder $q, string $status) => $status === 'out'
                ? $q->where('current_stock', 0)
                : $q->where('current_stock', '>', 0))
            ->when($filters['category_id'], fn (Builder $q, $id) => $q->where('category_id', (int) $id))
            ->when($filters['search'], function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(fn (Builder $w) => $w->where('sku', 'like', $like)->orWhere('name', 'like', $like));
            })
            ->orderByRaw('(min_stock - current_stock) DESC')
            ->orderBy('sku');
    }

    public function columns(): array
    {
        return [
            ...$this->itemColumns(fn (StockItem $i) => $i),
            ReportColumn::enum('status', 'สถานะ', fn (StockItem $i) => $i->current_stock === 0 ? 'out' : 'low', self::STATUS_KEYS, self::STATUS_TH),
            ReportColumn::number('qty_on_hand', 'คงเหลือ', fn (StockItem $i) => $i->current_stock),
            ReportColumn::number('min_stock', 'Min', fn (StockItem $i) => $i->min_stock),
            ReportColumn::number('max_stock', 'Max', fn (StockItem $i) => $i->max_stock),
            ReportColumn::number('shortfall', 'ขาด', fn (StockItem $i) => $i->min_stock - $i->current_stock),
            ReportColumn::number('reorder_qty', 'ควรสั่ง', fn (StockItem $i) => $this->reorderQty($i)),
            ReportColumn::money('unit_cost', 'ต้นทุน/หน่วย', fn (StockItem $i) => $this->unitCost($i)),
            ReportColumn::money('reorder_value', 'มูลค่าที่ควรสั่ง', fn (StockItem $i) => $this->reorderValue($i)),
            ReportColumn::date('last_move', 'เคลื่อนไหวล่าสุด', fn (StockItem $i) => $i->last_move_at),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $items = (clone $query)->setEagerLoads([])->get();

        return [
            ReportSummary::make('total', 'ทั้งหมด', $items->count()),
            ReportSummary::make('out_of_stock', 'หมดสต็อก', $items->where('current_stock', 0)->count(), 'red'),
            ReportSummary::make('below_min', 'ต่ำกว่า Min', $items->where('current_stock', '>', 0)->count(), 'amber'),
            ReportSummary::make('reorder_value', 'มูลค่าที่ควรสั่ง', round((float) $items->sum(fn (StockItem $i) => $this->reorderValue($i) ?? 0), 2), format: 'money'),
        ];
    }

    /** Units needed to refill to max — or to min when no max is set above it. */
    private function reorderQty(StockItem $item): int
    {
        return max($item->max_stock, $item->min_stock) - $item->current_stock;
    }

    /** Last receipt price, else the item's recorded cost; null when neither is known. */
    private function unitCost(StockItem $item): ?float
    {
        $cost = $item->last_unit_cost ?? $item->cost;

        return (float) $cost > 0 ? (float) $cost : null;
    }

    private function reorderValue(StockItem $item): ?float
    {
        $cost = $this->unitCost($item);

        return $cost === null ? null : round($this->reorderQty($item) * $cost, 2);
    }
}
