<?php

namespace App\Services\Report\Stock;

use App\Models\Stock\StockMovement;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Report\Tabular\Options;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\ReportSummary;
use App\Services\Report\Tabular\TabularReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * "ความเคลื่อนไหวรับเข้า-เบิกออก" (Report Center → Stock): every stock document inside the
 * chosen date range (this month by default), in the order it happened. A warehouse filter
 * keeps movements that left from or arrived at that warehouse.
 */
class StockMovementReport extends TabularReport
{
    use StockColumns;

    public function key(): string
    {
        return 'stock.movements';
    }

    public function title(): string
    {
        return 'ความเคลื่อนไหวรับเข้า-เบิกออก';
    }

    public function filters(): array
    {
        return [
            ReportFilter::date('from', today()->startOfMonth()->toDateString()),
            ReportFilter::date('to', today()->toDateString()),
            ReportFilter::select('type', Options::fromLabels(self::MOVEMENT_TYPE_KEYS)),
            ReportFilter::select('warehouse_id', Options::warehouses()),
            ReportFilter::select('category_id', Options::categories()),
            ReportFilter::search(),
        ];
    }

    public function query(User $viewer, array $filters): Builder
    {
        [$from, $to] = $this->dayRange($filters);

        return StockMovement::query()
            ->with(['item' => fn ($q) => $q->select('id', 'sku', 'name', 'category_id', 'unit_id')->with(self::ITEM_RELATIONS)])
            ->whereBetween('moved_at', [$from, $to])
            ->when($filters['type'], fn (Builder $q, string $type) => $q->where('type', $type))
            ->when($filters['warehouse_id'], function (Builder $q, $id) {
                $name = Warehouse::query()->whereKey((int) $id)->value('name');
                $q->where(fn (Builder $w) => $w->where('from_label', $name)->orWhere('to_label', $name));
            })
            ->when($filters['category_id'], fn (Builder $q, $id) => $q->whereHas('item', fn (Builder $i) => $i->where('category_id', (int) $id)))
            ->when($filters['search'], function (Builder $q, string $search) {
                $like = '%'.$search.'%';
                $q->where(fn (Builder $w) => $w->where('doc_no', 'like', $like)
                    ->orWhere('reference', 'like', $like)
                    ->orWhereHas('item', fn (Builder $i) => $i->where('sku', 'like', $like)->orWhere('name', 'like', $like)));
            })
            ->orderBy('moved_at')
            ->orderBy('id');
    }

    public function columns(): array
    {
        return [
            ReportColumn::date('moved_at', 'วันที่', fn (StockMovement $m) => $m->moved_at),
            ReportColumn::text('doc_no', 'เลขที่เอกสาร', fn (StockMovement $m) => $m->doc_no),
            ReportColumn::enum('type', 'ประเภท', fn (StockMovement $m) => $m->type, self::MOVEMENT_TYPE_KEYS, self::MOVEMENT_TYPE_TH),
            ...$this->itemColumns(fn (StockMovement $m) => $m->item),
            ReportColumn::number('qty', 'จำนวน', fn (StockMovement $m) => $m->qty),
            // Only receipts carry a cost on the movement; the rest draw from FIFO lots.
            ReportColumn::money('unit_cost', 'ต้นทุน/หน่วย', fn (StockMovement $m) => $m->unit_cost),
            ReportColumn::money('line_value', 'มูลค่า', fn (StockMovement $m) => $m->unit_cost === null ? null : $m->qty * (float) $m->unit_cost),
            ReportColumn::text('from_label', 'จาก', fn (StockMovement $m) => $m->from_label),
            ReportColumn::text('to_label', 'ไปยัง', fn (StockMovement $m) => $m->to_label),
            ReportColumn::text('reference', 'อ้างอิง', fn (StockMovement $m) => $m->reference),
            ReportColumn::text('recorded_by', 'ผู้บันทึก', fn (StockMovement $m) => $m->recorded_by),
        ];
    }

    public function summary(Builder $query, array $filters): array
    {
        $bare = fn () => (clone $query)->setEagerLoads([])->reorder();

        return [
            ReportSummary::make('total', 'ทั้งหมด', $bare()->count()),
            ReportSummary::make('qty_in', 'จำนวนเข้า', (int) $bare()->whereIn('type', StockMovement::INBOUND)->sum('qty'), 'green'),
            // Transfers move stock between warehouses without changing the total.
            ReportSummary::make('qty_out', 'จำนวนออก', (int) $bare()->whereNotIn('type', [...StockMovement::INBOUND, 'transfer'])->sum('qty'), 'amber'),
            ReportSummary::make('receive_value', 'มูลค่ารับเข้า', round((float) $bare()->where('type', 'receive')->sum(DB::raw('qty * COALESCE(unit_cost, 0)')), 2), format: 'money'),
        ];
    }
}
