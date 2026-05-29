<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class GroupRole extends Model
{
    protected $fillable = ['name', 'role_id', 'role'];

    /**
     * The role assigned to this group (resolved via role_id FK).
     */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /**
     * Read-accessor: ensures $group->role always returns the Role *model* (via
     * role_id FK) and not the legacy `role` string column that still exists in the
     * schema during this transitional migration phase. The string column is dropped
     * in a later task. Access the key via $group->role?->key.
     */
    public function getRoleAttribute(): ?Role
    {
        return $this->getRelationValue('role');
    }

    /**
     * Compatibility write-mutator: assigning a role *key* (string) resolves it to
     * role_id and also preserves the legacy `role` column value while the old
     * column still exists in the schema. Dropped in a later migration task.
     */
    public function setRoleAttribute(?string $key): void
    {
        if ($key === null) {
            $this->attributes['role_id'] = null;
            $this->attributes['role'] = null;
        } else {
            $role = Role::firstOrCreate(
                ['key' => $key],
                ['name' => ucfirst($key), 'color' => '#64748b', 'is_system' => $key === 'super'],
            );
            $this->attributes['role_id'] = $role->id;
            $this->attributes['role'] = $key;
        }
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
