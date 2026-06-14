<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Position extends Model
{
    protected $fillable = ['code', 'title', 'allow_special_position'];

    protected $casts = [
        'allow_special_position' => 'boolean',
    ];

    protected static function booted(): void
    {
        static::creating(function (Position $position) {
            // Auto-assign a sequential PST-#### code on create.
            if (blank($position->code)) {
                $max = (int) str_replace('PST-', '', (string) static::max('code'));
                $position->code = 'PST-'.str_pad((string) ($max + 1), 4, '0', STR_PAD_LEFT);
            }
        });
    }

    public function employees(): HasMany
    {
        return $this->hasMany(Employee::class);
    }
}
