<?php

// Names the place an IP signs in from: an admin-named network (longest prefix) first, else the GeoIP place.

namespace App\Services\Auth;

use App\Models\Auth\NetworkName;
use App\Support\Cidr;
use Illuminate\Support\Facades\Cache;

class LocationResolver
{
    public const CACHE_KEY = 'network-names';

    private const CACHE_SECONDS = 60;

    public function __construct(private readonly GeoIpLookup $geoIp) {}

    public function resolve(?string $ip): ?string
    {
        $ip = trim((string) $ip);
        if ($ip === '') {
            return null;
        }

        return $this->networkName($ip) ?? $this->geoIp->place($ip);
    }

    private function networkName(string $ip): ?string
    {
        $name = null;
        $longestPrefix = -1;

        foreach ($this->networks() as $network) {
            $prefix = Cidr::prefixLength($network['cidr']);
            if ($prefix > $longestPrefix && Cidr::contains($network['cidr'], $ip)) {
                $name = $network['name'];
                $longestPrefix = $prefix;
            }
        }

        return $name;
    }

    /** @return list<array{cidr: string, name: string}> */
    private function networks(): array
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_SECONDS, fn (): array => NetworkName::query()
            ->orderBy('id')
            ->get(['cidr', 'name'])
            ->map(fn (NetworkName $network): array => ['cidr' => $network->cidr, 'name' => $network->name])
            ->all());
    }
}
