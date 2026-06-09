<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Section extends Model
{
    protected $fillable = ['department_id', 'name', 'name_th'];

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
