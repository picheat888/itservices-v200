<?php

// Tests an IP address against a CIDR range or a single address, IPv4 and IPv6; invalid input never matches.

namespace App\Support;

class Cidr
{
    public static function contains(string $cidr, string $ip): bool
    {
        $range = self::parse($cidr);
        $address = self::pack($ip);

        if ($range === null || $address === null || strlen($address) !== strlen($range['network'])) {
            return false;
        }

        $wholeBytes = intdiv($range['prefix'], 8);
        $extraBits = $range['prefix'] % 8;

        if (substr($range['network'], 0, $wholeBytes) !== substr($address, 0, $wholeBytes)) {
            return false;
        }
        if ($extraBits === 0) {
            return true;
        }

        $mask = (0xFF << (8 - $extraBits)) & 0xFF;

        return (ord($range['network'][$wholeBytes]) & $mask) === (ord($address[$wholeBytes]) & $mask);
    }

    /** The prefix length: after the slash, or 32 / 128 for a single address; 0 when the text is not a range. */
    public static function prefixLength(string $cidr): int
    {
        return self::parse($cidr)['prefix'] ?? 0;
    }

    /** @return array{network: string, prefix: int}|null */
    private static function parse(string $cidr): ?array
    {
        $parts = explode('/', trim($cidr), 2);
        $network = self::pack($parts[0]);

        if ($network === null) {
            return null;
        }

        $maxPrefix = strlen($network) * 8;
        if (count($parts) === 1) {
            return ['network' => $network, 'prefix' => $maxPrefix];
        }
        if (! ctype_digit($parts[1]) || (int) $parts[1] > $maxPrefix) {
            return null;
        }

        return ['network' => $network, 'prefix' => (int) $parts[1]];
    }

    /** The address as raw bytes (4 or 16); an IPv4-mapped IPv6 address counts as IPv4. */
    private static function pack(string $ip): ?string
    {
        $ip = trim($ip);
        if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
            return null;
        }

        $bytes = inet_pton($ip);
        if ($bytes !== false && strlen($bytes) === 16 && str_starts_with($bytes, str_repeat("\0", 10)."\xFF\xFF")) {
            return substr($bytes, 12);
        }

        return $bytes === false ? null : $bytes;
    }
}
