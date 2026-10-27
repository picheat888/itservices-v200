<?php

namespace App\Models\Stock;

use App\Enums\Stock\StockCountReason;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockCountLine extends Model
{
    protected $fillable = ['stock_count_id', 'stock_item_id', 'system_qty', 'counted_qty', 'reason', 'reason_note', 'missing_serial_ids', 'found_serial_ids'];

    protected function casts(): array
    {
        return [
            'system_qty' => 'integer',
            'counted_qty' => 'integer',
            'reason' => StockCountReason::class,
            'missing_serial_ids' => 'array',
            'found_serial_ids' => 'array',
        ];
    }

    /** Counted minus system; null until a count is entered. */
    public function variance(): ?int
    {
        return $this->counted_qty === null ? null : $this->counted_qty - $this->system_qty;
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }

    public function count(): BelongsTo
    {
        return $this->belongsTo(StockCount::class, 'stock_count_id');
    }
}
