<?php

namespace App\Models\Stock;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockRequest extends Model
{
    protected $fillable = [
        'reference', 'stock_item_id', 'user_id', 'requester_name', 'qty', 'reason',
        'status', 'approver_name', 'approved_at', 'fulfilled_at', 'fulfilled_by', 'rejected_at',
        'cancelled_by', 'cancelled_at',
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
            'cancelled_at' => 'datetime',
        ];
    }

    /** Super, approvers and fulfillers see every request; everyone else only their own. */
    public static function seesAll(User $user): bool
    {
        return $user->isSuper() || $user->hasPermission('stock.approve') || $user->hasPermission('stock.fulfill');
    }

    /**
     * @param  Builder<StockRequest>  $query
     * @return Builder<StockRequest>
     */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return static::seesAll($user) ? $query : $query->where('user_id', $user->id);
    }

    public function isVisibleTo(User $user): bool
    {
        return static::seesAll($user) || (int) $this->user_id === (int) $user->id;
    }

    /** Pending: its requester or an approver. Approved: an approver or a fulfiller. Nothing later. */
    public function canBeCancelledBy(?User $user): bool
    {
        if ($user === null) {
            return false;
        }

        return match ($this->status) {
            'pending' => (int) $this->user_id === (int) $user->id || $user->hasPermission('stock.approve'),
            'approved' => $user->hasPermission('stock.approve') || $user->hasPermission('stock.fulfill'),
            default => false,
        };
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

    /** @return HasMany<StockMovement, $this> */
    public function issueMovements(): HasMany
    {
        return $this->hasMany(StockMovement::class, 'stock_request_id')->where('type', 'issue')->orderBy('id');
    }
}
