<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class EmailGroup extends Model
{
    protected $fillable = ['code', 'name', 'email', 'department_id', 'description', 'owner_employee_id'];

    protected static function booted(): void
    {
        static::creating(function (EmailGroup $g) {
            if (blank($g->code)) {
                $max = (int) str_replace('MG-', '', (string) static::max('code'));
                $g->code = 'MG-'.str_pad((string) ($max + 1), 4, '0', STR_PAD_LEFT);
            }
        });
    }

    public function memberships(): MorphMany
    {
        return $this->morphMany(AccessMembership::class, 'resource');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'owner_employee_id');
    }
}
