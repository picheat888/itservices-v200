<?php

namespace App\Enums;

enum UserRole: string
{
    case SuperAdmin = 'super';
    case ITStaff = 'admin';
    case HR = 'hr';
    case Employee = 'user';

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
