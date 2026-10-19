<?php

// Turns an IP address into a place name ("Bangkok, Thailand"), or null when the place is unknown.

namespace App\Services\Auth;

interface GeoIpLookup
{
    public function place(string $ip): ?string;
}
