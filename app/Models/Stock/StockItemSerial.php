<?php

namespace App\Models\Stock;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockItemSerial extends Model
{
    protected $fillable = [
        'stock_item_id', 'stock_movement_id', 'serial',
        'status', 'warehouse_id', 'reference', 'received_at',
    ];

    /** @return BelongsTo<StockItem, $this> */
    public function item(): BelongsTo
    {
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }

    /** The warehouse this unit currently sits in (null = unassigned). */
    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
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
