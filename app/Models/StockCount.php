<?php

namespace App\Models;

use App\Enums\StockCountStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockCount extends Model
{
    protected $fillable = ['reference', 'warehouse', 'category', 'status', 'note', 'counted_by', 'committed_at'];

    protected function casts(): array
    {
        return ['status' => StockCountStatus::class, 'committed_at' => 'datetime'];
    }

    /** Auto-assign SC-#### when no reference was supplied. */
    protected static function booted(): void
    {
        static::creating(function (StockCount $count) {
            if (blank($count->reference)) {
                $count->reference = 'SC-'.((static::max('id') ?? 1000) + 1);
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
