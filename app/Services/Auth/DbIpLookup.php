<?php

// GeoIpLookup backed by the DB-IP City Lite database file; a missing or unreadable file means no place, never an error.

namespace App\Services\Auth;

use GeoIp2\Database\Reader;
use Throwable;

class DbIpLookup implements GeoIpLookup
{
    /** Database file, relative to storage_path(). */
    public const PATH = 'app/geoip/dbip-city-lite.mmdb';

    private ?Reader $reader = null;

    private bool $opened = false;

    public function __construct(private readonly ?string $path = null) {}

    public function __destruct()
    {
        try {
            $this->reader?->close();
        } catch (Throwable) {
            // Already closed
        }
    }

    public static function databasePath(): string
    {
        return storage_path(self::PATH);
    }

    /** "{city}, {country}", the country alone when the city is unknown, null when the country is unknown. */
    public static function format(?string $city, ?string $country): ?string
    {
        if ($country === null || $country === '') {
            return null;
        }

        return $city === null || $city === '' ? $country : "{$city}, {$country}";
    }

    public function place(string $ip): ?string
    {
        $reader = filter_var($ip, FILTER_VALIDATE_IP) === false ? null : $this->reader();
        if ($reader === null) {
            return null;
        }

        try {
            $record = $reader->city($ip);

            return self::format($record->city->names['en'] ?? null, $record->country->names['en'] ?? null);
        } catch (Throwable) {
            return null;
        }
    }

    // Opened on first use, once per instance
    private function reader(): ?Reader
    {
        if ($this->opened) {
            return $this->reader;
        }
        $this->opened = true;

        $path = $this->path ?? self::databasePath();
        try {
            $this->reader = is_file($path) ? new Reader($path) : null;
        } catch (Throwable) {
            $this->reader = null;
        }

        return $this->reader;
    }
}
