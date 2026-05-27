<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Brand extends Model
{
    protected $fillable = ['name', 'description'];

    /** Asset models that belong to this brand. */
    public function assetModels(): HasMany
    {
        return $this->hasMany(AssetModel::class);
    }
}
