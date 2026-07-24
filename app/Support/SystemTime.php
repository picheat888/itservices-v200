<?php

namespace App\Support;

use App\Models\Settings\AppSetting;
use Carbon\CarbonInterface;

/**
 * Formats stored-UTC timestamps in the system display timezone
 * (Settings -> Company). Pure DATE columns must NOT go through this —
 * they carry no time component, so shifting them can change the day.
 */
class SystemTime
{
    /** Per-request memo — resources format many rows per response. */
    private static ?string $tz = null;

    private static function tz(): string
    {
        return self::$tz ??= AppSetting::timezone();
    }

    /** "YYYY-MM-DD" of a UTC timestamp in the system timezone; null passes through. */
    public static function date(?CarbonInterface $at): ?string
    {
        return $at?->copy()->timezone(self::tz())->toDateString();
    }

    /** "YYYY-MM-DD HH:mm" of a UTC timestamp in the system timezone; null passes through. */
    public static function dateTime(?CarbonInterface $at): ?string
    {
        return $at?->copy()->timezone(self::tz())->format('Y-m-d H:i');
    }
}
