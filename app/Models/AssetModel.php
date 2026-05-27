<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AssetModel extends Model
{
    protected $fillable = ['name', 'brand_id', 'description'];

    /** The brand this model belongs to. */
    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }
}
