<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockCountLine extends Model
{
    protected $fillable = ['stock_count_id', 'stock_item_id', 'system_qty', 'counted_qty'];

    protected function casts(): array
    {
        return ['system_qty' => 'integer', 'counted_qty' => 'integer'];
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
