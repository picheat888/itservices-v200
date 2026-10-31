<?php

namespace App\Models\Stock;

use App\Enums\Stock\StockCountAdjustMode;
use App\Enums\Stock\StockCountStatus;
use App\Models\User;
use App\Support\DocNumber;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockCount extends Model
{
    protected $fillable = ['reference', 'warehouse', 'warehouse_id', 'category', 'status', 'adjust_mode', 'note', 'counted_by', 'committed_at', 'recount_of_id', 'committed_by'];

    protected function casts(): array
    {
        return [
            'status' => StockCountStatus::class,
            'adjust_mode' => StockCountAdjustMode::class,
            'committed_at' => 'datetime',
        ];
    }

    /** Auto-assign SC-<YEAR>-<NNN> when no reference was supplied, counted per year. */
    protected static function booted(): void
    {
        static::creating(function (StockCount $count) {
            $count->warehouse_id ??= Warehouse::idOf($count->warehouse);
            if (blank($count->reference)) {
                $count->reference = DocNumber::nextIn(static::query(), 'reference', 'SC-'.now()->year.'-', 3);
            }
        });
    }

    /** @return HasMany<StockCountLine, $this> */
    public function lines(): HasMany
    {
        return $this->hasMany(StockCountLine::class);
    }

    public function countedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'counted_by');
    }

    /** @return BelongsTo<StockCount, $this> */
    public function recountOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'recount_of_id');
    }

    /** @return BelongsTo<User, $this> */
    public function committedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'committed_by');
    }

    /**
     * Serials of the item the original count wrote off here and nothing has touched since; null when not a recount.
     *
     * @return Builder<StockItemSerial>|null
     */
    public function lostSerials(int $stockItemId): ?Builder
    {
        return $this->lostSerialsOf([$stockItemId]);
    }

    /**
     * lostSerials() for several items in one query.
     *
     * @param  list<int>  $stockItemIds
     * @return Builder<StockItemSerial>|null
     */
    public function lostSerialsOf(array $stockItemIds): ?Builder
    {
        $original = $this->recountOf;
        if ($original === null) {
            return null;
        }

        return StockItemSerial::whereIn('stock_item_id', $stockItemIds)
            ->where('warehouse_id', $this->warehouse_id)
            ->where('status', 'adjusted')
            ->where('reference', $original->reference);
    }
}
