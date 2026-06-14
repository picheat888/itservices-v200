<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class FileShare extends Model
{
    protected $fillable = ['code', 'name', 'path', 'department_id', 'size_label', 'owner_employee_id'];

    protected static function booted(): void
    {
        static::creating(function (FileShare $fs) {
            if (blank($fs->code)) {
                $max = (int) str_replace('FS-', '', (string) static::max('code'));
                $fs->code = 'FS-'.str_pad((string) ($max + 1), 4, '0', STR_PAD_LEFT);
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
