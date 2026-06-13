<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Section extends Model
{
    protected $fillable = ['code', 'department_id', 'name', 'name_th'];

    protected static function booted(): void
    {
        // Auto-assign a sequential SEC-#### code on create.
        static::creating(function (Section $section) {
            if (blank($section->code)) {
                $max = (int) str_replace('SEC-', '', (string) static::max('code'));
                $section->code = 'SEC-'.str_pad((string) ($max + 1), 4, '0', STR_PAD_LEFT);
            }
        });
    }

    /** The department this section belongs to. */
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    /** Employees assigned to this section. */
    public function employees(): HasMany
    {
        return $this->hasMany(Employee::class);
    }
}
