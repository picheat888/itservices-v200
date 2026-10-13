<?php

namespace App\Support;

use App\Models\Settings\AppSetting;
use Carbon\CarbonInterface;

/**
 * Display text for dates in emails, Excel and PDF, from the Settings → System date format.
 * Twin of resources/js/shared/lib/datetime.ts; tests/Fixtures/date-format-cases.json keeps them equal.
 */
class DateDisplay
{
    public const FORMATS = ['dmy_slash', 'dmy_dash', 'ymd_slash', 'ymd_dash', 'd_mon_y', 'd_month_y'];

    public const ERAS = ['ce', 'be'];

    public const TIMES = ['24', '12'];

    public const DEFAULTS = ['format' => 'dmy_slash', 'era' => 'ce', 'time' => '24'];

    private const EMPTY = '—';

    private const WALL = '/^(\d{4})-(\d{2})(?:-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(?:[zZ]|[+-]\d{2}:?\d{2})?)?$/';

    /** @var array{th: array{short: list<string>, long: list<string>}, en: array{short: list<string>, long: list<string>}, am: string, pm: string}|null */
    private static ?array $names = null;

    /** @return array{format: string, era: string, time: string} */
    public static function config(): array
    {
        return self::normalize([
            'format' => AppSetting::get('date_format'),
            'era' => AppSetting::get('date_era'),
            'time' => AppSetting::get('time_format'),
        ]);
    }

    /**
     * @param  array<string, mixed>  $config
     * @return array{format: string, era: string, time: string}
     */
    public static function normalize(array $config): array
    {
        $pick = fn (mixed $value, array $allowed, string $fallback): string => in_array((string) $value, $allowed, true) ? (string) $value : $fallback;

        return [
            'format' => $pick($config['format'] ?? null, self::FORMATS, self::DEFAULTS['format']),
            'era' => $pick($config['era'] ?? null, self::ERAS, self::DEFAULTS['era']),
            'time' => $pick($config['time'] ?? null, self::TIMES, self::DEFAULTS['time']),
        ];
    }

    /** @param  array<string, mixed>|null  $config */
    public static function date(CarbonInterface|string|null $value, ?array $config = null, string $lang = 'th'): string
    {
        $p = self::parse($value);

        return $p === null || $p['d'] === null ? self::EMPTY : self::datePart($p, self::resolve($config), $lang);
    }

    /** @param  array<string, mixed>|null  $config */
    public static function time(CarbonInterface|string|null $value, ?array $config = null, string $lang = 'th'): string
    {
        $p = self::parse($value);

        return $p === null || $p['h'] === null || $p['i'] === null ? self::EMPTY : self::timePart($p['h'], $p['i'], self::resolve($config));
    }

    /** @param  array<string, mixed>|null  $config */
    public static function dateTime(CarbonInterface|string|null $value, ?array $config = null, string $lang = 'th'): string
    {
        $p = self::parse($value);
        if ($p === null || $p['d'] === null) {
            return self::EMPTY;
        }
        $c = self::resolve($config);
        $date = self::datePart($p, $c, $lang);

        return $p['h'] === null || $p['i'] === null ? $date : $date.' '.self::timePart($p['h'], $p['i'], $c);
    }

    /** @param  array<string, mixed>|null  $config */
    public static function month(CarbonInterface|string|null $value, ?array $config = null, string $lang = 'th'): string
    {
        $p = self::parse($value);

        return $p === null ? self::EMPTY : self::monthName($p['m'], $lang, 'short');
    }

    /** @param  array<string, mixed>|null  $config */
    public static function monthYear(CarbonInterface|string|null $value, ?array $config = null, string $lang = 'th'): string
    {
        $p = self::parse($value);

        return $p === null ? self::EMPTY : self::monthYearPart($p, self::resolve($config), $lang);
    }

    /** @param  array<string, mixed>|null  $config */
    public static function monthYearLong(CarbonInterface|string|null $value, ?array $config = null, string $lang = 'th'): string
    {
        $p = self::parse($value);

        return $p === null ? self::EMPTY : self::monthName($p['m'], $lang, 'long').' '.self::eraYear($p['y'], self::resolve($config)['era']);
    }

    /** @param  array<string, mixed>|null  $config */
    public static function dayMonth(CarbonInterface|string|null $value, ?array $config = null, string $lang = 'th'): string
    {
        $p = self::parse($value);

        return $p === null || $p['d'] === null ? self::EMPTY : self::dayMonthPart($p, $lang);
    }

    /** @param  array<string, mixed>|null  $config */
    public static function range(CarbonInterface|string|null $from, CarbonInterface|string|null $to, ?array $config = null, string $lang = 'th'): string
    {
        $f = self::parse($from);
        $t = self::parse($to);
        if ($f === null || $t === null || $f['d'] === null || $t['d'] === null) {
            return self::EMPTY;
        }
        $c = self::resolve($config);
        if ($f['y'] === $t['y'] && $f['m'] === $t['m'] && $f['d'] === 1 && $t['d'] === self::lastDay($t['y'], $t['m'])) {
            return self::monthYearPart($f, $c, $lang);
        }
        if ($f['y'] === $t['y']) {
            return self::dayMonthPart($f, $lang).' – '.self::dayMonthPart($t, $lang).' '.self::eraYear($t['y'], $c['era']);
        }

        return self::dayMonthPart($f, $lang).' '.self::eraYear($f['y'], $c['era']).' – '.self::dayMonthPart($t, $lang).' '.self::eraYear($t['y'], $c['era']);
    }

    /** @param  array<string, mixed>|null  $config */
    public static function year(int $year, ?array $config = null, string $lang = 'th'): string
    {
        return self::eraYear($year, self::resolve($config)['era']);
    }

    /**
     * @param  array{y: int, m: int, d: int|null, h: int|null, i: int|null}  $p
     * @param  array{format: string, era: string, time: string}  $c
     */
    private static function datePart(array $p, array $c, string $lang): string
    {
        $d = self::pad((int) $p['d']);
        $m = self::pad($p['m']);
        $y = self::eraYear($p['y'], $c['era']);

        return match ($c['format']) {
            'dmy_dash' => "{$d}-{$m}-{$y}",
            'ymd_slash' => "{$y}/{$m}/{$d}",
            'ymd_dash' => "{$y}-{$m}-{$d}",
            'd_mon_y' => "{$d} ".self::monthName($p['m'], $lang, 'short')." {$y}",
            'd_month_y' => "{$d} ".self::monthName($p['m'], $lang, 'long')." {$y}",
            default => "{$d}/{$m}/{$y}",
        };
    }

    /** @param  array{format: string, era: string, time: string}  $c */
    private static function timePart(int $hour, int $minute, array $c): string
    {
        if ($c['time'] === '12') {
            $suffix = $hour < 12 ? self::names()['am'] : self::names()['pm'];

            return ($hour % 12 ?: 12).':'.self::pad($minute)." {$suffix}";
        }

        return self::pad($hour).':'.self::pad($minute);
    }

    /**
     * @param  array{y: int, m: int, d: int|null, h: int|null, i: int|null}  $p
     * @param  array{format: string, era: string, time: string}  $c
     */
    private static function monthYearPart(array $p, array $c, string $lang): string
    {
        return self::monthName($p['m'], $lang, 'short').' '.self::eraYear($p['y'], $c['era']);
    }

    /** @param  array{y: int, m: int, d: int|null, h: int|null, i: int|null}  $p */
    private static function dayMonthPart(array $p, string $lang): string
    {
        return self::pad((int) $p['d']).' '.self::monthName($p['m'], $lang, 'short');
    }

    /**
     * @param  array<string, mixed>|null  $config
     * @return array{format: string, era: string, time: string}
     */
    private static function resolve(?array $config): array
    {
        return $config === null ? self::config() : self::normalize($config);
    }

    /** @return array{y: int, m: int, d: int|null, h: int|null, i: int|null}|null */
    private static function parse(CarbonInterface|string|null $value): ?array
    {
        if ($value instanceof CarbonInterface) {
            $value = $value->format('Y-m-d H:i:s');
        }
        if ($value === null || ! preg_match(self::WALL, trim($value), $match)) {
            return null;
        }
        $part = fn (int $index): ?int => isset($match[$index]) && $match[$index] !== '' ? (int) $match[$index] : null;
        $parts = ['y' => (int) $match[1], 'm' => (int) $match[2], 'd' => $part(3), 'h' => $part(4), 'i' => $part(5)];

        if ($parts['m'] < 1 || $parts['m'] > 12) {
            return null;
        }
        if ($parts['d'] !== null && ! checkdate($parts['m'], $parts['d'], $parts['y'])) {
            return null;
        }
        if ($parts['h'] !== null && ($parts['h'] > 23 || ($parts['i'] ?? 0) > 59)) {
            return null;
        }

        return $parts;
    }

    private static function eraYear(int $year, string $era): string
    {
        return (string) ($era === 'be' ? $year + 543 : $year);
    }

    private static function monthName(int $month, string $lang, string $length): string
    {
        return self::names()[$lang === 'th' ? 'th' : 'en'][$length][$month - 1];
    }

    private static function lastDay(int $year, int $month): int
    {
        return (int) date('t', (int) mktime(0, 0, 0, $month, 1, $year));
    }

    private static function pad(int $number): string
    {
        return str_pad((string) $number, 2, '0', STR_PAD_LEFT);
    }

    /** @return array{th: array{short: list<string>, long: list<string>}, en: array{short: list<string>, long: list<string>}, am: string, pm: string} */
    private static function names(): array
    {
        return self::$names ??= json_decode((string) file_get_contents(dirname(__DIR__, 2).'/resources/js/shared/lib/date-names.json'), true);
    }
}
