<?php

namespace App\Support;

use Carbon\CarbonInterface;

/**
 * Formats stored timestamps for display. The whole system runs on local wall
 * time (APP_TIMEZONE, single-site deployment) — the database stores local time
 * and no timezone conversion happens anywhere; these helpers only format.
 * Pure DATE columns must NOT go through dateTime() — they carry no time component.
 */
class SystemTime
{
    /** "YYYY-MM-DD" of a stored timestamp; null passes through. */
    public static function date(?CarbonInterface $at): ?string
    {
        return $at?->toDateString();
    }

    /** "YYYY-MM-DD HH:mm" of a stored timestamp; null passes through. */
    public static function dateTime(?CarbonInterface $at): ?string
    {
        return $at?->format('Y-m-d H:i');
    }
}
