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
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * "มูลค่าคงคลัง" (Report Center → Stock): on-hand quantity × FIFO cost per SKU at the end of
 * the chosen day (today by default).
 *
 * - Quantity at that day = today's stock minus the net of every movement recorded after it.
 * - Value for today = the open FIFO lots, exactly what StockItem::stockValue() shows.
 * - Value for a past day = FIFO means the units still on hand are always the newest ones
 *   received, so the lots received up to that day are filled newest-first until they
 *   cover the quantity. Units no lot explains (stock that predates lot tracking) are
 *   valued at the oldest lot's cost, else the item's recorded cost.
 */
class StockValuationReport extends TabularReport
{
    use StockColumns;

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
        $asOf = Carbon::parse($filters['as_of'])->endOfDay();
        $isCurrent = $asOf->gte(today()->endOfDay());
        $movedAfter = $this->netMovedAfter($asOf);

        return StockItem::query()
            ->select('stock_items.*')
            ->selectSub($movedAfter, 'moved_after')
            ->selectRaw('? as valued_current', [$isCurrent ? 1 : 0])
            ->with([
                ...self::ITEM_RELATIONS,
                'lots' => $isCurrent
                    ? fn ($q) => $q->where('qty_remaining', '>', 0)
                    : fn ($q) => $q->where('received_at', '<=', $asOf)->orderByDesc('received_at')->orderByDesc('id'),
            ])
            ->whereRaw('stock_items.current_stock - ('.$movedAfter->toSql().') > 0', $movedAfter->getBindings())
            ->when($filters['category_id'], fn (Builder $q, $id) => $q->where('category_id', (int) $id))
            ->when($filters['search'], function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(fn (Builder $w) => $w->where('sku', 'like', $like)->orWhere('name', 'like', $like));
            })
            ->orderBy('sku');
    }

    public function columns(): array
    {
        return [
            ...$this->itemColumns(fn (StockItem $i) => $i),
            ReportColumn::number('qty_on_hand', 'คงเหลือ', fn (StockItem $i) => $this->qtyAt($i)),
            ReportColumn::money('avg_cost', 'ต้นทุนเฉลี่ย', fn (StockItem $i) => round($this->valueAt($i) / $this->qtyAt($i), 2)),
            ReportColumn::money('stock_value', 'มูลค่าคงคลัง', fn (StockItem $i) => $this->valueAt($i)),
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
}
