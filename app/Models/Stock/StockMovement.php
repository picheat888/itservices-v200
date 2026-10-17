<?php

namespace App\Models\Stock;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    protected $fillable = [
        'doc_no', 'type', 'stock_item_id', 'qty', 'unit_cost', 'from_label', 'to_label',
        'reference', 'recorded_by', 'user_id', 'notes', 'moved_at', 'from_warehouse_id', 'to_warehouse_id',
    ];

    /** Movement types that increase on-hand stock; the rest decrease it. */
    public const INBOUND = ['receive', 'return', 'adjust_up'];

    /** Types whose from_label / to_label names a warehouse (the other side is a vendor or a person). */
    public const FROM_WAREHOUSE = ['issue', 'transfer', 'adjust_down'];

    public const TO_WAREHOUSE = ['receive', 'return', 'transfer', 'adjust_up'];

    protected static function booted(): void
    {
        // The warehouse ids follow the labels it is written with, so a rename keeps the history attached.
        static::creating(function (StockMovement $movement) {
            if ($movement->from_warehouse_id === null && in_array($movement->type, self::FROM_WAREHOUSE, true)) {
                $movement->from_warehouse_id = Warehouse::idOf($movement->from_label);
            }
            if ($movement->to_warehouse_id === null && in_array($movement->type, self::TO_WAREHOUSE, true)) {
                $movement->to_warehouse_id = Warehouse::idOf($movement->to_label);
            }
        });
    }

    protected function casts(): array
    {
        return [
            'qty' => 'integer',
            'unit_cost' => 'decimal:2',
            'moved_at' => 'datetime',
        ];
    }

    /** Signed stock delta this movement applies to the SKU total. Transfer is neutral. */
    public function delta(): int
    {
        if ($this->type === 'transfer') {
            return 0;
        }

        return in_array($this->type, self::INBOUND, true) ? $this->qty : -$this->qty;
    }

    /** @return BelongsTo<StockItem, $this> */
    public function item(): BelongsTo
    {
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
