<?php

// Tells whether a Web Push subscription endpoint points at a known browser push service (config webpush.endpoint_hosts).

namespace App\Support;

final class PushEndpoint
{
    public static function isAllowed(string $url): bool
    {
        $parts = parse_url($url);
        if ($parts === false || strtolower($parts['scheme'] ?? '') !== 'https') {
            return false;
        }
        if (isset($parts['user']) || isset($parts['pass']) || (isset($parts['port']) && $parts['port'] !== 443)) {
            return false;
        }

        $host = strtolower($parts['host'] ?? '');
        if ($host === '') {
            return false;
        }

        foreach ((array) config('webpush.endpoint_hosts', []) as $allowed) {
            $allowed = strtolower((string) $allowed);
            $matches = str_starts_with($allowed, '.') ? str_ends_with($host, $allowed) : $host === $allowed;
            if ($matches) {
                return true;
            }
        }

        return false;
    }
}
