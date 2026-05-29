<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class GroupRole extends Model
{
    // 'role' is kept fillable as a write-alias: assigning a role *key* string is
    // resolved to role_id by setRoleAttribute(); it never persists a column.
    protected $fillable = ['name', 'role_id', 'role'];

    /**
     * The role assigned to this group (resolved via role_id FK). $group->role
     * returns the Role model; use $group->role?->key for the key string.
     */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /**
     * Compatibility write-mutator: assigning a role *key* string resolves it to
     * role_id, so `['role' => '<key>']` assignments still work.
     */
    public function setRoleAttribute(?string $key): void
    {
        $this->attributes['role_id'] = $key === null
            ? null
            : Role::firstOrCreate(
                ['key' => $key],
                ['name' => ucfirst($key), 'color' => '#64748b', 'is_system' => $key === 'super'],
            )->id;
        unset($this->attributes['role']);
    }

    /**
     * Employees that belong to this group role.
     */
    public function employees(): BelongsToMany
    {
        return $this->belongsToMany(Employee::class, 'group_role_employee');
    }

    /**
     * Departments that belong to this group role.
     */
    public function departments(): BelongsToMany
    {
        return $this->belongsToMany(Department::class, 'group_role_department');
    }
}
