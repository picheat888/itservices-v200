<?php

namespace App\Models\Access;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class SocialPlatform extends Model
{
    protected $fillable = ['code', 'name', 'url', 'color', 'policy'];

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
