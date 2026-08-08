<?php

namespace App\Models\Access;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Facades\Storage;

class SocialPlatform extends Model
{
    protected $fillable = ['code', 'name', 'url', 'color', 'policy', 'logo_path'];

    /**
     * Authenticated URL of the platform logo (private disk), or null when none
     * uploaded. Tagged with the stored filename (random per upload) so a replaced
     * logo arrives under a new URL — the route alone never changes, and the
     * response is cached, which left the browser painting the previous logo.
     */
    public function getLogoUrlAttribute(): ?string
    {
        if (! $this->logo_path) {
            return null;
        }

        return route('files.social-logo', ['socialPlatform' => $this, 'v' => substr(sha1($this->logo_path), 0, 8)]);
    }

    protected static function booted(): void
    {
        // Replacing or removing a logo already deletes the file it replaces;
        // deleting the record has to take the last one with it, or the binary
        // stays on the private disk with nothing left that names it.
        static::deleting(function (SocialPlatform $sp) {
            if ($sp->logo_path) {
                Storage::disk('local')->delete($sp->logo_path);
            }
        });

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
