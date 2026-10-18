<?php

namespace App\Support;

use App\Models\Permission\Role;

/**
 * Resolves a role key from a request with an exact, case-sensitive match in PHP.
 * SQL collations (utf8mb4_unicode_ci) treat "SUPER" as "super", so lookups go through here.
 */
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
