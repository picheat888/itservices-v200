<?php

namespace App\Models\Access;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Facades\Storage;

class SocialPlatform extends Model
{
    protected $fillable = ['code', 'name', 'url', 'color', 'policy', 'logo_path'];

    /** Public URL of the platform logo (public disk), or null when none uploaded. */
    public function getLogoUrlAttribute(): ?string
    {
        return $this->logo_path ? Storage::disk('public')->url($this->logo_path) : null;
    }

    protected static function booted(): void
    {
        static::creating(function (SocialPlatform $sp) {
            if (blank($sp->code)) {
                $max = (int) str_replace('SM-', '', (string) static::max('code'));
                $sp->code = 'SM-'.str_pad((string) ($max + 1), 4, '0', STR_PAD_LEFT);
            }
        });
    }

    public function memberships(): MorphMany
    {
        return $this->morphMany(AccessMembership::class, 'resource');
    }
}
