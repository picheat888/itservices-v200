<?php

namespace App\Support;

use App\Models\AppSetting;

/**
 * SLA response/resolution targets per ticket priority. Targets are configurable
 * from Settings → Tickets and stored as JSON under the `ticket_sla` key; the
 * values here are the defaults (mirroring the design prototype).
 *
 * - `response` is the first-response target in minutes.
 * - `resolve` is the close-the-case target in hours.
 */
class TicketSla
{
    /** Storage key for the saved target map. */
    public const KEY = 'ticket_sla';

    /**
     * @return array<string, array{response: int, resolve: int}>
     */
    public static function defaults(): array
    {
        return [
            'critical' => ['response' => 15, 'resolve' => 4],
            'high' => ['response' => 30, 'resolve' => 8],
            'medium' => ['response' => 120, 'resolve' => 24],
            'low' => ['response' => 240, 'resolve' => 72],
        ];
    }

    /**
     * Saved targets merged over the defaults, so any priority without an explicit
     * override still resolves to a target.
     *
     * @return array<string, array{response: int, resolve: int}>
     */
    public static function targets(): array
    {
        $stored = json_decode((string) AppSetting::get(self::KEY, '{}'), true);
        $stored = is_array($stored) ? $stored : [];

        $targets = self::defaults();
        foreach ($targets as $priority => $default) {
            $targets[$priority] = [
                'response' => (int) ($stored[$priority]['response'] ?? $default['response']),
                'resolve' => (int) ($stored[$priority]['resolve'] ?? $default['resolve']),
            ];
        }

        return $targets;
    }

    /** Resolution target (hours) for a priority, falling back to the medium default. */
    public static function resolveHours(?string $priority): int
    {
        $targets = self::targets();

        return $targets[$priority]['resolve'] ?? $targets['medium']['resolve'];
    }
}
