<?php

namespace App\Support;

use App\Models\User;

/**
 * Registry of every report in the Report Center (/reports).
 *
 * One entry per report: the domain it belongs to (groups the hub), the permissions a
 * reader must hold ALL of to open it, and the export formats it offers. The hub list,
 * each report's Form Request authorize() and the sidebar all ask this class, so a
 * report is never listed to someone its endpoint would refuse.
 */
class ReportCatalogue
{
    public const TICKETS_OVERVIEW = 'tickets.overview';

    /**
     * @return array<string, array{domain: string, requires: list<string>, formats: list<string>}>
     */
    public static function definitions(): array
    {
        return [
            // Priority and SLA are desk internals (TicketResource::showsDeskInternals), so
            // seeing every ticket is not enough on its own — the reader must also work cases.
            self::TICKETS_OVERVIEW => [
                'domain' => 'tickets',
                'requires' => ['tickets.view_all', 'tickets.resolve'],
                'formats' => ['xlsx', 'pdf'],
            ],
        ];
    }

    public static function allows(?User $user, string $key): bool
    {
        $definition = self::definitions()[$key] ?? null;
        if ($user === null || $definition === null) {
            return false;
        }

        foreach ($definition['requires'] as $permission) {
            if (! $user->hasPermission($permission)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @return list<array{key: string, domain: string, formats: list<string>}>
     */
    public static function forUser(?User $user): array
    {
        $visible = [];
        foreach (self::definitions() as $key => $definition) {
            if (self::allows($user, $key)) {
                $visible[] = ['key' => $key, 'domain' => $definition['domain'], 'formats' => $definition['formats']];
            }
        }

        return $visible;
    }
}
