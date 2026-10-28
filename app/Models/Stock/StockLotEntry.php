<?php

namespace App\Models\Stock;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One signed quantity change on a lot (a transfer writes 0); the lot's remaining qty is the sum of its entries. */
class StockLotEntry extends Model
{
    protected $fillable = [
        'stock_lot_id', 'stock_movement_id', 'warehouse_id', 'from_warehouse_id',
        'qty', 'reference', 'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'integer',
            'occurred_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<StockLot, $this> */
    public function lot(): BelongsTo
    {
        return $this->belongsTo(StockLot::class, 'stock_lot_id');
    }

    /** @return BelongsTo<StockMovement, $this> */
    public function movement(): BelongsTo
    {
        return $this->belongsTo(StockMovement::class, 'stock_movement_id');
    }

    /** @return BelongsTo<Warehouse, $this> */
    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }
}
