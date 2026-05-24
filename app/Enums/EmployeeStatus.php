<?php

namespace App\Enums;

enum EmployeeStatus: string
{
    case Active = 'active';
    case Resigned = 'resigned';

    public function label(): string
    {
        return match ($this) {
            self::Active => 'Active',
            self::Resigned => 'Resigned',
        };
    }
}
