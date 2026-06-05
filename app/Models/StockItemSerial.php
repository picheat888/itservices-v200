<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockItemSerial extends Model
{
    protected $fillable = [
        'stock_item_id', 'stock_movement_id', 'serial',
        'status', 'warehouse', 'reference', 'received_at',
    ];

    /** @return BelongsTo<StockItem, $this> */
    public function item(): BelongsTo
    {
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }

    /** @return BelongsTo<StockMovement, $this> */
    public function movement(): BelongsTo
    {
        return $this->belongsTo(StockMovement::class, 'stock_movement_id');
    }

    /** @return HasMany<StockItemSerialEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(StockItemSerialEvent::class)->orderBy('occurred_at');
    }

    protected function casts(): array
    {
        return [
            'received_at' => 'datetime',
        ];
    }
}
