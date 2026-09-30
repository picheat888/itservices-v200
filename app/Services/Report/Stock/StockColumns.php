<?php

namespace App\Services\Report\Stock;

use App\Models\Stock\StockItem;
use App\Services\Report\Tabular\ReportColumn;

/**
 * Columns and labels shared by the stock tabular reports (StockMovementReport,
 * StockBelowMinReport, StockValuationReport): how a SKU is identified on a row, and the
 * movement-type wording. Thai labels mirror resources/js/lang/th/stock.ts.
 */
trait StockColumns
{
    private const MOVEMENT_TYPE_KEYS = [
        'receive' => 'stock_mv_receive', 'issue' => 'stock_mv_issue', 'return' => 'stock_mv_return',
        'transfer' => 'stock_mv_transfer', 'adjust_up' => 'stock_mv_adjust_up', 'adjust_down' => 'stock_mv_adjust_down',
    ];

    private const MOVEMENT_TYPE_TH = [
        'receive' => 'รับเข้า', 'issue' => 'เบิกออก', 'return' => 'คืนของ',
        'transfer' => 'ย้ายคลัง', 'adjust_up' => 'ปรับเพิ่ม +', 'adjust_down' => 'ปรับลด −',
    ];

    /**
     * SKU, item name, category and unit — read off the row through $item, so the movement
     * report (row = movement) and the item reports (row = item) share one definition.
     *
     * @param  \Closure(mixed): ?StockItem  $item
     * @return list<ReportColumn>
     */
    private function itemColumns(\Closure $item): array
    {
        return [
            ReportColumn::text('sku', 'SKU', fn ($row) => $item($row)?->sku),
            ReportColumn::text('item_name', 'รายการ', fn ($row) => $item($row)?->name),
            ReportColumn::localized('category', 'หมวด', fn ($row) => ($category = $item($row)?->category) ? ['name' => $category->name, 'name_th' => $category->name_th] : null),
            ReportColumn::text('unit', 'หน่วย', fn ($row) => $item($row)?->unit?->name),
        ];
    }

    /** Eager loads itemColumns() reads, relative to the item. */
    private const ITEM_RELATIONS = ['category:id,name,name_th', 'unit:id,name'];
}
