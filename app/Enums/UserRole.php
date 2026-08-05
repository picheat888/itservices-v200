<?php

namespace App\Enums;

/**
 * The four role templates a fresh install ships with.
 *
 * `super` is special: it bypasses every permission check rather than being granted
 * keys (see User::hasPermission), and its own grants are therefore never read.
 * Because that key is load-bearing, this enum is the only place that spells it —
 * anything comparing a role key goes through isSuperKey().
 */
enum UserRole: string
{
    case SuperAdmin = 'super';
    case ITStaff = 'admin';
    case HR = 'hr';
    case Employee = 'user';

    /** Whether the given role key is the all-access one. */
    public static function isSuperKey(?string $key): bool
    {
        return $key === self::SuperAdmin->value;
    }

    public function label(): string
    {
        return match ($this) {
            self::SuperAdmin => 'Super Administrator',
            self::ITStaff => 'IT Staff',
            self::HR => 'HR Officer',
            self::Employee => 'Employee',
        };
    }
}
