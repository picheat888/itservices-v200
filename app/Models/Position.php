<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Position extends Model
{
    protected $fillable = ['code', 'title'];

    protected static function booted(): void
    {
        static::creating(function (Position $position) {
            if (blank($position->code)) {
                $next = (static::max('id') ?? 0) + 1;
                $position->code = 'P-'.str_pad((string) $next, 3, '0', STR_PAD_LEFT);
            }
        });
    }

    public function employees(): HasMany
    {
        return $this->hasMany(Employee::class);
    }
}
