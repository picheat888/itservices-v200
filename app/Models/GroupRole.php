<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class GroupRole extends Model
{
    protected $fillable = ['name', 'role'];

    public function employees(): BelongsToMany
    {
        return $this->belongsToMany(Employee::class, 'group_role_employee');
    }

    public function departments(): BelongsToMany
    {
        return $this->belongsToMany(Department::class, 'group_role_department');
    }
}
