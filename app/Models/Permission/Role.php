<?php

namespace App\Models\Permission;

use App\Models\User;
use App\Support\Permissions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    protected $fillable = ['key', 'name', 'color', 'is_system'];

    protected function casts(): array
    {
        return ['is_system' => 'boolean'];
    }

    /**
     * The catalogue keys this role is allowed (stale non-catalogue rows are ignored).
     *
     * @return array<int, string>
     */
    public function allowedKeys(): array
    {
        $allowed = RolePermission::where('role_id', $this->id)->where('allowed', true)->pluck('permission')->all();

        return array_values(array_intersect($allowed, Permissions::all()));
    }

    /**
     * Count users that belong to this role (resolved via role_id FK).
     */
    public function members(): int
    {
        return User::where('role_id', $this->id)->count();
    }

    /**
     * All users assigned to this role.
     *
     * @return HasMany<User, $this>
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }
}
