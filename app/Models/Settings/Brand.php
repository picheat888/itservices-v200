<?php

namespace App\Models\Settings;

use App\Models\Concerns\RecordsActors;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Brand extends Model
{
    use RecordsActors;

    protected $fillable = ['name', 'description'];

    /** Asset models that belong to this brand. */
    public function assetModels(): HasMany
    {
        return $this->hasMany(AssetModel::class);
    }
}
