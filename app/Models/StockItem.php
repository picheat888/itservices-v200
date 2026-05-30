<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockItem extends Model
{
    protected $fillable = [
        'sku', 'name', 'serial', 'track_serial', 'category', 'brand', 'model', 'unit',
        'cost', 'current_stock', 'min_stock', 'max_stock',
        'warehouse', 'supplier', 'warranty', 'last_move_at',
    ];

    /**
     * Defaults so a freshly-created SKU (which no longer sends stock/cost — those
     * come from Receive) reports 0 immediately, not null.
     */
    protected $attributes = [
        'current_stock' => 0,
        'cost' => 0,
        'min_stock' => 0,
        'max_stock' => 0,
        'track_serial' => false,
    ];

    /** Days with no movement before an item is considered "dead stock". */
    public const DEAD_STOCK_DAYS = 90;

    /** @return HasMany<StockMovement, $this> */
    public function movements(): HasMany
    {
        return $this->hasMany(StockMovement::class)->latest('moved_at');
    }

    /** @return HasMany<StockItemSerial, $this> */
    public function serials(): HasMany
    {
        return $this->hasMany(StockItemSerial::class);
    }

    /** @return HasMany<StockLot, $this> */
    public function lots(): HasMany
    {
        return $this->hasMany(StockLot::class);
    }

    /** FIFO stock value: Σ(qty_remaining × unit_cost) across open lots. */
    public function stockValue(): float
    {
        $lots = $this->relationLoaded('lots') ? $this->lots : $this->lots()->get();

        return (float) $lots->sum(fn (StockLot $l) => $l->qty_remaining * (float) $l->unit_cost);
    }

    /** Weighted-average unit cost of the stock currently on hand (0 when empty). */
    public function avgCost(): float
    {
        return $this->current_stock > 0 ? round($this->stockValue() / $this->current_stock, 2) : 0.0;
    }

    protected function casts(): array
    {
        return [
            'track_serial' => 'boolean',
            'cost' => 'decimal:2',
            'current_stock' => 'integer',
            'min_stock' => 'integer',
            'max_stock' => 'integer',
            'last_move_at' => 'date',
        ];
    }

    /** Whole days since the last recorded movement (null when never moved). */
    public function daysSinceLastMove(): ?int
    {
        if ($this->last_move_at === null) {
            return null;
        }

        return (int) $this->last_move_at->startOfDay()->diffInDays(now()->startOfDay());
    }

    /**
     * Derived stock health: out (0), low (< min), over (> max),
     * dead (no movement for DEAD_STOCK_DAYS+), otherwise ok.
     */
    public function status(): string
    {
        if ($this->current_stock === 0) {
            return 'out';
        }
        if ($this->current_stock < $this->min_stock) {
            return 'low';
        }
        if ($this->current_stock > $this->max_stock) {
            return 'over';
        }
        $days = $this->daysSinceLastMove();
        if ($days !== null && $days > self::DEAD_STOCK_DAYS) {
            return 'dead';
        }

        return 'ok';
    }
}
