<?php

namespace App\Models\Asset;

use App\Enums\Asset\AssetTransferKind;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AssetTransfer extends Model
{
    protected $fillable = [
        'asset_id', 'asset_tag', 'asset_model', 'kind', 'from_owner', 'to_owner', 'reason', 'performed_by',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'kind' => AssetTransferKind::class,
        ];
    }

    /** @return BelongsTo<Asset, $this> */
    public function asset(): BelongsTo
    {
        return $this->belongsTo(Asset::class);
    }
}
