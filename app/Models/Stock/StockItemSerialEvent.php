<?php

namespace App\Models\Stock;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockItemSerialEvent extends Model
{
    protected $fillable = [
        'stock_item_serial_id', 'stock_item_id', 'event', 'stock_movement_id',
        'reference', 'warehouse', 'from_label', 'to_label', 'user_id', 'recorded_by', 'occurred_at',
    ];

    protected function casts(): array
    {
        return ['occurred_at' => 'datetime'];
    }

    /**
     * Append a lifecycle event for a serial. Fills stock_item_id from the serial and
     * defaults occurred_at to now().
     *
     * @param  array<string, mixed>  $attrs
     */
    public static function log(StockItemSerial $serial, string $event, array $attrs = []): self
    {
        return static::create(array_merge([
            'stock_item_serial_id' => $serial->id,
            'stock_item_id' => $serial->stock_item_id,
            'event' => $event,
            'occurred_at' => now(),
        ], $attrs));
    }

    /** @return BelongsTo<StockItemSerial, $this> */
    public function serial(): BelongsTo
    {
        return $this->belongsTo(StockItemSerial::class, 'stock_item_serial_id');
    }

    /** @return BelongsTo<StockMovement, $this> */
    public function movement(): BelongsTo
    {
        return $this->belongsTo(StockMovement::class, 'stock_movement_id');
    }
}
