<?php

// Reduces a User-Agent header to an OS family and a browser family for the device list and login log.

namespace App\Services\Auth;

class UserAgentLabel
{
    public const OTHER = 'Other';

    /**
     * @return array{os: string, browser: string}
     */
    public static function parse(?string $userAgent, bool $touchHint = false): array
    {
        $agent = (string) $userAgent;

        return ['os' => self::os($agent, $touchHint), 'browser' => self::browser($agent)];
    }

    private static function os(string $agent, bool $touchHint): string
    {
        return match (true) {
            str_contains($agent, 'iPad') => 'iPadOS',
            str_contains($agent, 'iPhone'), str_contains($agent, 'iPod') => 'iOS',
            str_contains($agent, 'Android') => 'Android',
            str_contains($agent, 'CrOS') => 'ChromeOS',
            str_contains($agent, 'Windows') => 'Windows',
            str_contains($agent, 'Macintosh') => $touchHint ? 'iPadOS' : 'macOS',
            str_contains($agent, 'Linux'), str_contains($agent, 'X11') => 'Linux',
            default => self::OTHER,
        };
    }

    private static function browser(string $agent): string
    {
        return match (true) {
            preg_match('/\bEdg(e|A|iOS)?\//', $agent) === 1 => 'Edge',
            str_contains($agent, 'OPR/'), str_contains($agent, 'Opera') => 'Opera',
            str_contains($agent, 'Firefox/'), str_contains($agent, 'FxiOS/') => 'Firefox',
            str_contains($agent, 'Chrome/'), str_contains($agent, 'CriOS/') => 'Chrome',
            str_contains($agent, 'Safari/') => 'Safari',
            default => self::OTHER,
        };
    }
}
