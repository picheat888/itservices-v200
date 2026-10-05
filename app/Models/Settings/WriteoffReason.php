<?php

namespace App\Models\Settings;

use App\Models\Asset\Asset;
use App\Models\Concerns\RecordsActors;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A reason an asset is written off (Settings → Assets): picked in the write-off dialog, counted by
 * the write-off report. Linked from assets.writeoff_reason_id; the free-text note stays in
 * assets.last_reason.
 */
class WriteoffReason extends Model
{
    use RecordsActors;

    protected $fillable = ['name', 'description'];

    /** @return HasMany<Asset, $this> */
    public function assets(): HasMany
    {
        return $this->hasMany(Asset::class);
    }
}
