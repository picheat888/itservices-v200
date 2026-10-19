<?php

// A database that is full or cannot be reached (MariaDB 1040 / 1203 / 2002) answers 503 "server busy" with a short
// Retry-After, instead of the 500 a real bug gets.

namespace App\Support;

use Illuminate\Database\QueryException;
use PDOException;
use Throwable;

class DatabaseBusy
{
    /** The `message` a JSON 503 carries, and the HttpException message the Blade page reads. */
    public const MESSAGE = 'server_busy';

    /** Seconds the reader is asked to wait. */
    public const RETRY_AFTER = 15;

    /** Too many connections, max_user_connections reached, cannot connect to the server. */
    private const CODES = [1040, 1203, 2002];

    public static function is(Throwable $exception): bool
    {
        if (! $exception instanceof QueryException) {
            return false;
        }

        $codes = [$exception->errorInfo[1] ?? null];
        $previous = $exception->getPrevious();
        if ($previous instanceof PDOException) {
            $codes[] = $previous->errorInfo[1] ?? null;
            $codes[] = $previous->getCode();
        }

        foreach ($codes as $code) {
            if (is_numeric($code) && in_array((int) $code, self::CODES, true)) {
                return true;
            }
        }

        // Connection errors only name the driver code in the text: "SQLSTATE[HY000] [1040] Too many connections"
        return (bool) preg_match('/SQLSTATE\[\w+\] \[(1040|1203|2002)\]/', $exception->getMessage());
    }
}
