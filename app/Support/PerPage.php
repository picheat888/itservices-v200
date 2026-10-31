<?php

// The page size every list endpoint reads from ?per_page: 20 by default, kept between a floor and 100.

namespace App\Support;

use Illuminate\Http\Request;

class PerPage
{
    public const DEFAULT = 20;

    public const MAX = 100;

    /** ?per_page clamped to [min, 100]; missing means 20, anything not a number reads as the floor. */
    public static function from(Request $request, int $min = 10): int
    {
        return self::clamp($request->query('per_page', self::DEFAULT), $min);
    }

    public static function clamp(mixed $value, int $min = 10): int
    {
        return max($min, min(self::MAX, (int) $value));
    }
}
