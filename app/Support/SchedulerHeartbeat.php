<?php

namespace App\Support;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

// Proof the scheduler is alive: stamped every minute, read by the log digest.
class SchedulerHeartbeat
{
    private const KEY = 'scheduler:heartbeat';

    public static function beat(): void
    {
        Cache::forever(self::KEY, now()->toIso8601String());
    }

    public static function last(): ?Carbon
    {
        $stamp = Cache::get(self::KEY);

        return is_string($stamp) ? Carbon::parse($stamp) : null;
    }
}
