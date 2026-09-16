<?php

namespace App\Models\Stock;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockRequest extends Model
{
    protected $fillable = [
        'reference', 'stock_item_id', 'user_id', 'requester_name', 'qty', 'reason',
        'status', 'approver_name', 'approved_at', 'fulfilled_at', 'fulfilled_by', 'rejected_at',
    ];

    /**
     * Auto-assign REQ-<YEAR>-<NNNN> when no reference was supplied, counted per year.
     * Reads the max existing reference for the year to determine the next sequence.
     */
    protected static function booted(): void
    {
        static::creating(function (StockRequest $request) {
            if (blank($request->reference)) {
                $year = now()->year;
                $last = static::where('reference', 'like', "REQ-{$year}-%")
                    ->orderByDesc('reference')
                    ->lockForUpdate()
                    ->value('reference');
                $seq = $last ? ((int) substr($last, -4)) + 1 : 1;
                $request->reference = sprintf('REQ-%d-%04d', $year, $seq);
            }
        });
    }

    protected function casts(): array
    {
        return [
            'qty' => 'integer',
            'approved_at' => 'datetime',
            'fulfilled_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<StockItem, $this> */
    public function item(): BelongsTo
    {
        return $this->belongsTo(StockItem::class, 'stock_item_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
