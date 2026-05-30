<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    protected $fillable = [
        'type', 'stock_item_id', 'qty', 'unit_cost', 'from_label', 'to_label',
        'reference', 'recorded_by', 'user_id', 'notes', 'moved_at',
    ];

    /** Movement types that increase on-hand stock; the rest decrease it. */
    public const INBOUND = ['receive', 'return', 'adjust_up'];

    protected function casts(): array
    {
        return [
            'qty' => 'integer',
            'unit_cost' => 'decimal:2',
            'moved_at' => 'datetime',
        ];
    }

    /** Signed stock delta this movement applies (+qty inbound, -qty outbound). */
    public function delta(): int
    {
        return in_array($this->type, self::INBOUND, true) ? $this->qty : -$this->qty;
    }

    /** @return BelongsTo<StockItem, $this> */
    public function item(): BelongsTo
    {
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }
}
