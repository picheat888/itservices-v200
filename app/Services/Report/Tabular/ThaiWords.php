<?php

namespace App\Services\Report\Tabular;

/**
 * The app's Thai wording read from resources/js/lang/th/*.ts, so a report file names its
 * filters with the same words the page shows (rep_fl_*, rep_opt_*).
 */
final class ThaiWords
{
    /** @var array<string, string>|null */
    private static ?array $words = null;

    public static function get(string $key): ?string
    {
        return self::all()[$key] ?? null;
    }

    /**
     * @return array<string, string>
     */
    private static function all(): array
    {
        if (self::$words !== null) {
            return self::$words;
        }

        $words = [];
        foreach (glob(resource_path('js/lang/th/*.ts')) ?: [] as $file) {
            preg_match_all("/^\s*([a-z][a-z0-9_]*):\s*'((?:[^'\\\\]|\\\\.)*)',?\s*$/m", (string) file_get_contents($file), $matches, PREG_SET_ORDER);
            foreach ($matches as [, $key, $value]) {
                $words[$key] = stripcslashes($value);
            }
        }

        return self::$words = $words;
    }
}
