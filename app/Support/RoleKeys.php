<?php

namespace App\Support;

use App\Models\Permission\Role;

// Exact, case-sensitive role key lookup done in PHP, not SQL.
class RoleKeys
{
    public static function find(?string $key): ?Role
    {
        if ($key === null || $key === '') {
            return null;
        }

        return Role::query()->get()->first(fn (Role $role) => $role->key === $key);
    }

    /**
     * @return array<int, string>
     */
    public static function all(): array
    {
        return Role::query()->pluck('key')->all();
    }
}
