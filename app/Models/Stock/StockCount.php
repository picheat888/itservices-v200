<?php

namespace App\Models\Stock;

use App\Enums\Stock\StockCountAdjustMode;
use App\Enums\Stock\StockCountStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockCount extends Model
{
    protected $fillable = ['reference', 'warehouse', 'category', 'status', 'adjust_mode', 'note', 'counted_by', 'committed_at'];

    protected function casts(): array
    {
        return [
            'status' => StockCountStatus::class,
            'adjust_mode' => StockCountAdjustMode::class,
            'committed_at' => 'datetime',
        ];
    }

    /**
     * Auto-assign SC-<YEAR>-<NNN> when no reference was supplied, counted per year.
     * Reads the max existing reference for the year to determine the next sequence.
     */
    protected static function booted(): void
    {
        static::creating(function (StockCount $count) {
            if (blank($count->reference)) {
                $year = now()->year;
                $last = static::where('reference', 'like', "SC-{$year}-%")
                    ->orderByDesc('reference')
                    ->lockForUpdate()
                    ->value('reference');
                $seq = $last ? ((int) substr($last, -3)) + 1 : 1;
                $count->reference = sprintf('SC-%d-%03d', $year, $seq);
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
}
