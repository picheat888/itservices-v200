<?php

// The release number (config/app.php) and the time `npm run build` ran (public/build/build-info.json).

namespace App\Support;

class AppVersion
{
    private static ?string $builtAt = null;

    private static bool $builtAtRead = false;

    public static function number(): string
    {
        return (string) config('app.version');
    }

    /** "YYYY-MM-DD HH:mm" in the build machine's local time, or null before the first build. */
    public static function builtAt(): ?string
    {
        if (! self::$builtAtRead) {
            self::$builtAt = self::readBuiltAt();
            self::$builtAtRead = true;
        }

        return self::$builtAt;
    }

    public static function flush(): void
    {
        self::$builtAt = null;
        self::$builtAtRead = false;
    }

    private static function readBuiltAt(): ?string
    {
        $path = (string) config('app.build_info_path');
        if ($path === '' || ! is_file($path)) {
            return null;
        }

        $builtAt = json_decode((string) file_get_contents($path), true)['built_at'] ?? null;

        return is_string($builtAt) && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $builtAt) === 1 ? $builtAt : null;
    }
}
