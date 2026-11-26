<?php

namespace App\Models\Settings;

use App\Models\Concerns\RecordsActors;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AssetModel extends Model
{
    use RecordsActors;

    protected $fillable = ['name', 'brand_id', 'description', 'photo_path'];

    protected $hidden = ['photo_path'];

    protected $appends = ['photo_url'];

    /** The brand this model belongs to. */
    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    /**
     * Authenticated URL of the model photo (private disk), or null when none was attached.
     * Tagged with a hash of the stored filename so a replaced photo arrives under a new URL,
     * since the route itself never changes and its response is cached.
     */
    public function getPhotoUrlAttribute(): ?string
    {
        if (! $this->photo_path) {
            return null;
        }

        return route('files.model-photo', ['assetModel' => $this, 'v' => substr(sha1($this->photo_path), 0, 8)], false);
    }
}
