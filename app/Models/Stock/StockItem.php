<?php

namespace App\Models\Stock;

use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Unit;
use App\Models\Settings\WarrantyType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockItem extends Model
{
    protected $fillable = [
        'sku', 'name', 'serial', 'track_serial', 'category', 'brand_id', 'model_id', 'unit_id',
        'cost', 'current_stock', 'min_stock', 'max_stock',
        'warranty_type_id', 'last_move_at',
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

    /**
     * Next auto-generated SKU in the form "SKU-#######" (7-digit, zero-padded,
     * running number). Only SKUs already matching this exact pattern feed the
     * sequence, so manually-entered legacy codes never block or collide with it.
     * Computed in PHP (not SQL) to stay portable across MySQL and SQLite.
     */
    public static function nextSku(): string
    {
        $seq = static::query()
            ->where('sku', 'like', 'SKU-%')
            ->pluck('sku')
            ->map(fn (string $sku): int => preg_match('/^SKU-(\d{7})$/', $sku, $m) ? (int) $m[1] : 0)
            ->max() ?? 0;

        return 'SKU-'.str_pad((string) ($seq + 1), 7, '0', STR_PAD_LEFT);
    }

    /** Manufacturer brand (Master Data). */
    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    /** Model/product line, scoped to the brand (Master Data). */
    public function model(): BelongsTo
    {
        return $this->belongsTo(AssetModel::class, 'model_id');
    }

    /** Unit of measure for this item (Master Data). */
    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    /** Warranty type applied to this item (Master Data). */
    public function warrantyType(): BelongsTo
    {
        return $this->belongsTo(WarrantyType::class);
    }

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

    /** @return HasMany<StockRequest, $this> */
    public function requests(): HasMany
    {
        return $this->hasMany(StockRequest::class);
    }

    /** @return HasMany<StockBalance, $this> */
    public function balances(): HasMany
    {
        return $this->hasMany(StockBalance::class);
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

    /**
     * Constrain a query to items whose derived status() equals $status. Mirrors the
     * exact branch order of status() so server-side filtering matches the PHP result.
     * Accepts the five concrete statuses or the virtual 'alerts' (= anything not 'ok').
     *
     * @param  Builder<StockItem>  $query
     * @return Builder<StockItem>
     */
    public function scopeWithDerivedStatus(Builder $query, string $status): Builder
    {
        // "dead" = healthy stock level but untouched for more than DEAD_STOCK_DAYS.
        $deadCutoff = now()->startOfDay()->subDays(self::DEAD_STOCK_DAYS);
        $isHealthyLevel = fn (Builder $q) => $q->where('current_stock', '>', 0)
            ->whereColumn('current_stock', '>=', 'min_stock')
            ->whereColumn('current_stock', '<=', 'max_stock');
        $isDead = fn (Builder $q) => $isHealthyLevel($q)
            ->whereNotNull('last_move_at')
            ->whereDate('last_move_at', '<', $deadCutoff);

        return match ($status) {
            'out' => $query->where('current_stock', 0),
            'low' => $query->where('current_stock', '>', 0)->whereColumn('current_stock', '<', 'min_stock'),
            'over' => $query->where('current_stock', '>', 0)
                ->whereColumn('current_stock', '>=', 'min_stock')
                ->whereColumn('current_stock', '>', 'max_stock'),
            'dead' => $query->where(fn (Builder $q) => $isDead($q)),
            'ok' => $query->where(fn (Builder $q) => $isHealthyLevel($q)
                ->where(fn (Builder $w) => $w->whereNull('last_move_at')->orWhereDate('last_move_at', '>=', $deadCutoff))),
            // alerts = NOT ok: out OR below-min OR over-max OR dead.
            'alerts' => $query->where(fn (Builder $q) => $q
                ->where('current_stock', 0)
                ->orWhereColumn('current_stock', '<', 'min_stock')
                ->orWhereColumn('current_stock', '>', 'max_stock')
                ->orWhere(fn (Builder $d) => $isDead($d))),
            default => $query,
        };
    }
}
