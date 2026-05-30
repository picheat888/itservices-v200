<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockLot extends Model
{
    protected $fillable = [
        'stock_item_id', 'stock_movement_id', 'unit_cost',
        'qty_received', 'qty_remaining', 'received_at',
    ];

    protected function casts(): array
    {
        return [
            'unit_cost' => 'decimal:2',
            'qty_received' => 'integer',
            'qty_remaining' => 'integer',
            'received_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<StockItem, $this> */
    public function item(): BelongsTo
    {
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }
}
