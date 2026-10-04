<?php

namespace App\Models\Settings;

use App\Models\Concerns\RecordsActors;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AssetModel extends Model
{
    use RecordsActors;

    protected $fillable = ['name', 'brand_id', 'description'];

    /** The brand this model belongs to. */
    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }
}
