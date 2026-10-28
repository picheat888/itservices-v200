<?php

namespace App\Models\Stock;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockLot extends Model
{
    protected $fillable = [
        'stock_item_id', 'stock_movement_id', 'unit_cost',
        'qty_received', 'qty_remaining', 'received_at', 'lot_no', 'warehouse_id',
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

    /** The receive movement this lot was created from (PO, supplier, warehouse, who). */
    public function movement(): BelongsTo
    {
        return $this->belongsTo(StockMovement::class, 'stock_movement_id');
    }

    /** @return BelongsTo<Warehouse, $this> */
    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    /** @return HasMany<StockLotEntry, $this> */
    public function entries(): HasMany
    {
        return $this->hasMany(StockLotEntry::class);
    }

    /** @return HasMany<StockItemSerial, $this> */
    public function serials(): HasMany
    {
        return $this->hasMany(StockItemSerial::class);
    }
}
