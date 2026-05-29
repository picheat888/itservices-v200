<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RolePermission extends Model
{
    protected $fillable = ['role_id', 'role', 'permission', 'allowed'];

    protected function casts(): array
    {
        return ['allowed' => 'boolean'];
    }

    /**
     * The role this permission entry belongs to (resolved via role_id FK).
     */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /**
     * Compatibility write-mutator: assigning a role *key* (string) resolves it to
     * role_id and also preserves the legacy `role` column value (NOT NULL) while
     * the old column still exists in the schema. Dropped in a later migration task.
     */
    public function setRoleAttribute(?string $key): void
    {
        if ($key === null) {
            $this->attributes['role_id'] = null;
            $this->attributes['role'] = '';
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
     * Compatibility write-mutator: when role_id is assigned directly, also back-fills
     * the legacy `role` string column (NOT NULL) so the DB constraint is satisfied
     * during the transitional period before the old column is dropped.
     */
    public function setRoleIdAttribute(?int $id): void
    {
        $this->attributes['role_id'] = $id;
        if ($id !== null) {
            $key = Role::find($id)?->key ?? '';
            $this->attributes['role'] = $key;
        } else {
            $this->attributes['role'] = '';
        }
    }
}
