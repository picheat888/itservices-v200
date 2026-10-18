<?php

namespace App\Models\Permission;

use App\Models\User;
use App\Support\Permissions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Role extends Model
{
    protected $fillable = ['key', 'name', 'color', 'is_system'];

    protected function casts(): array
    {
        return ['is_system' => 'boolean'];
    }

    /** A key slugged from the name, numbered when it is taken. */
    public static function uniqueKeyFor(string $name): string
    {
        $base = Str::slug($name, '_') ?: 'role';
        $key = $base;
        $i = 1;
        while (self::where('key', $key)->exists()) {
            $key = $base.'_'.$i++;
        }

        return $key;
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

    /** Token for the stored permission set, so a save made from an older copy can be refused. */
    public function permissionsVersion(): string
    {
        return self::versionOf($this->allowedKeys());
    }

    /**
     * The version token of a set of permission keys (order does not matter).
     *
     * @param  array<int, string>  $keys
     */
    public static function versionOf(array $keys): string
    {
        $keys = array_values(array_unique(array_intersect($keys, Permissions::all())));
        sort($keys);

        return sha1(implode(',', $keys));
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
