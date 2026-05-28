<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockRequest extends Model
{
    protected $fillable = [
        'stock_item_id', 'user_id', 'requester_name', 'dept', 'qty', 'reason',
        'status', 'approver_name', 'approved_at', 'fulfilled_at', 'rejected_at',
    ];

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
}
