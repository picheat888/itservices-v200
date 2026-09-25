<?php

namespace App\Support;

use App\Models\User;
use App\Services\Report\Asset\AssetRegisterReport;
use App\Services\Report\Asset\WarrantyExpiringReport;
use App\Services\Report\Contract\ContractExpiringReport;
use App\Services\Report\Tabular\TabularReport;

/**
 * Registry of every report in the Report Center (/reports).
 *
 * One entry per report: the domain it belongs to (groups the hub), the permissions a
 * reader must hold ALL of to open it, and the export formats it offers. The hub list,
 * each report's Form Request authorize() and the sidebar all ask this class, so a
 * report is never listed to someone its endpoint would refuse.
 *
 * `kind` tells the two report styles apart: `custom` reports (Phase 1) ship their own
 * controller/routes; `tabular` reports (Phase 2+) are declared once as a TabularReport
 * class and served entirely by the generic /reports/r/{key} endpoints.
 */
class ReportCatalogue
{
    public const TICKETS_OVERVIEW = 'tickets.overview';

    public const CONTRACTS_EXPIRING = 'contracts.expiring';

    public const ASSETS_REGISTER = 'assets.register';

    public const ASSETS_WARRANTY_EXPIRING = 'assets.warranty_expiring';

    /**
     * @return array<string, array{domain: string, kind: string, class?: class-string<TabularReport>, requires: list<string>, formats: list<string>}>
     */
    public static function definitions(): array
    {
        return [
            // Priority and SLA are desk internals (TicketResource::showsDeskInternals), so
            // seeing every ticket is not enough on its own — the reader must also work cases.
            self::TICKETS_OVERVIEW => [
                'domain' => 'tickets',
                'kind' => 'custom',
                'requires' => ['tickets.view_all', 'tickets.resolve'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::CONTRACTS_EXPIRING => [
                'domain' => 'contracts',
                'kind' => 'tabular',
                'class' => ContractExpiringReport::class,
                'requires' => ['contracts.view'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::ASSETS_REGISTER => [
                'domain' => 'assets',
                'kind' => 'tabular',
                'class' => AssetRegisterReport::class,
                'requires' => ['assets.view'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::ASSETS_WARRANTY_EXPIRING => [
                'domain' => 'assets',
                'kind' => 'tabular',
                'class' => WarrantyExpiringReport::class,
                'requires' => ['assets.view'],
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
     * @return list<array{key: string, domain: string, kind: string, formats: list<string>}>
     */
    public static function forUser(?User $user): array
    {
        $visible = [];
        foreach (self::definitions() as $key => $definition) {
            if (self::allows($user, $key)) {
                $visible[] = ['key' => $key, 'domain' => $definition['domain'], 'kind' => $definition['kind'], 'formats' => $definition['formats']];
            }
        }

        return $visible;
    }

    /** The tabular definition behind a catalogue key, or null when the key is unknown or not tabular. */
    public static function tabular(string $key): ?TabularReport
    {
        $definition = self::definitions()[$key] ?? null;

        return ($definition['kind'] ?? null) === 'tabular' ? app($definition['class']) : null;
    }
}
