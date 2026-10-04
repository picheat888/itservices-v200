<?php

namespace App\Support;

use App\Models\User;
use App\Services\Report\Access\SoftwareLicenseReport;
use App\Services\Report\Asset\AssetOverviewReport;
use App\Services\Report\Asset\AssetTransferHistoryReport;
use App\Services\Report\Asset\WarrantyExpiringReport;
use App\Services\Report\Contract\ContractExpiringReport;
use App\Services\Report\Contract\ContractMonthlyCostReport;
use App\Services\Report\Employee\JoinersLeaversReport;
use App\Services\Report\Employee\LeaverAssetsReport;
use App\Services\Report\Request\ApprovalTimeReport;
use App\Services\Report\Request\ItPendingRequestReport;
use App\Services\Report\Request\RequestSummaryReport;
use App\Services\Report\Stock\StockBelowMinReport;
use App\Services\Report\Stock\StockMovementReport;
use App\Services\Report\Stock\StockValuationReport;
use App\Services\Report\Tabular\TabularReport;
use App\Services\Report\Ticket\TicketBacklogReport;
use App\Services\Report\Ticket\TicketRequestSlaReport;

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

    public const TICKETS_BACKLOG = 'tickets.backlog';

    public const TICKETS_REQUEST_SLA = 'tickets.request_sla';

    public const ASSETS_OVERVIEW = 'assets.overview';

    public const ASSETS_TRANSFER_HISTORY = 'assets.transfer_history';

    public const CONTRACTS_EXPIRING = 'contracts.expiring';

    public const ASSETS_WARRANTY_EXPIRING = 'assets.warranty_expiring';

    public const CONTRACTS_MONTHLY_COST = 'contracts.monthly_cost';

    public const STOCK_MOVEMENTS = 'stock.movements';

    public const STOCK_BELOW_MIN = 'stock.below_min';

    public const STOCK_VALUATION = 'stock.valuation';

    public const REQUESTS_SUMMARY = 'requests.summary';

    public const REQUESTS_APPROVAL_TIME = 'requests.approval_time';

    public const REQUESTS_IT_PENDING = 'requests.it_pending';

    public const EMPLOYEES_JOINERS_LEAVERS = 'employees.joiners_leavers';

    public const EMPLOYEES_LEAVER_ASSETS = 'employees.leaver_assets';

    public const ACCESS_SOFTWARE_LICENSES = 'access.software_licenses';

    /**
     * @return array<string, array{domain: string, kind: string, class?: class-string<TabularReport>, requires: list<string>, formats: list<string>, range?: bool}>
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
                'range' => true,
            ],
            // The backlog carries SLA verdicts, so it asks what the overview asks; within that,
            // it counts only the reader's `tickets.level_*` categories. ("Ticket ตามแผนกและหมวด"
            // and "ผลงานเจ้าหน้าที่ IT" were merged into the overview's cards on 2026-10-02.)
            self::TICKETS_BACKLOG => [
                'domain' => 'tickets',
                'kind' => 'tabular',
                'class' => TicketBacklogReport::class,
                'requires' => ['tickets.view_all', 'tickets.resolve'],
                'formats' => ['xlsx', 'pdf'],
            ],
            // Tickets opened from approved requests, judged per request type — the same SLA
            // verdicts as the overview, so it asks what the overview asks (and keeps to the
            // reader's `tickets.level_*` categories).
            self::TICKETS_REQUEST_SLA => [
                'domain' => 'tickets',
                'kind' => 'tabular',
                'class' => TicketRequestSlaReport::class,
                'requires' => ['tickets.view_all', 'tickets.resolve'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            self::CONTRACTS_EXPIRING => [
                'domain' => 'contracts',
                'kind' => 'tabular',
                'class' => ContractExpiringReport::class,
                'requires' => ['contracts.view'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::CONTRACTS_MONTHLY_COST => [
                'domain' => 'contracts',
                'kind' => 'tabular',
                'class' => ContractMonthlyCostReport::class,
                'requires' => ['contracts.view'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::ASSETS_OVERVIEW => [
                'domain' => 'assets',
                'kind' => 'tabular',
                'class' => AssetOverviewReport::class,
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
            self::ASSETS_TRANSFER_HISTORY => [
                'domain' => 'assets',
                'kind' => 'tabular',
                'class' => AssetTransferHistoryReport::class,
                'requires' => ['assets.view'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            // The movement log is its own permission in the stock module (stock.view_events).
            self::STOCK_MOVEMENTS => [
                'domain' => 'stock',
                'kind' => 'tabular',
                'class' => StockMovementReport::class,
                'requires' => ['stock.view_events'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            self::STOCK_BELOW_MIN => [
                'domain' => 'stock',
                'kind' => 'tabular',
                'class' => StockBelowMinReport::class,
                'requires' => ['stock.view'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::STOCK_VALUATION => [
                'domain' => 'stock',
                'kind' => 'tabular',
                'class' => StockValuationReport::class,
                'requires' => ['stock.view'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::REQUESTS_SUMMARY => [
                'domain' => 'requests',
                'kind' => 'tabular',
                'class' => RequestSummaryReport::class,
                'requires' => ['requests.view_all'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            self::REQUESTS_APPROVAL_TIME => [
                'domain' => 'requests',
                'kind' => 'tabular',
                'class' => ApprovalTimeReport::class,
                'requires' => ['requests.view_all'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            self::REQUESTS_IT_PENDING => [
                'domain' => 'requests',
                'kind' => 'tabular',
                'class' => ItPendingRequestReport::class,
                'requires' => ['requests.view_all'],
                'formats' => ['xlsx', 'pdf'],
            ],
            // Employee reports follow the Employee detail's own-module "peek": employees.view
            // is enough to see what a person holds, without assets.view.
            self::EMPLOYEES_JOINERS_LEAVERS => [
                'domain' => 'employees',
                'kind' => 'tabular',
                'class' => JoinersLeaversReport::class,
                'requires' => ['employees.view'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            self::EMPLOYEES_LEAVER_ASSETS => [
                'domain' => 'employees',
                'kind' => 'tabular',
                'class' => LeaverAssetsReport::class,
                'requires' => ['employees.view'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::ACCESS_SOFTWARE_LICENSES => [
                'domain' => 'access',
                'kind' => 'tabular',
                'class' => SoftwareLicenseReport::class,
                'requires' => ['access.software_view'],
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
     * `range`: the report has a from/to date range, so a Report Center link may hand it the hub's
     * period (?from=&to=). Set by hand per report; ReportCatalogueTest checks it against each
     * tabular report's own filters.
     *
     * @return list<array{key: string, domain: string, kind: string, formats: list<string>, range: bool}>
     */
    public static function forUser(?User $user): array
    {
        $visible = [];
        foreach (self::definitions() as $key => $definition) {
            if (self::allows($user, $key)) {
                $visible[] = ['key' => $key, 'domain' => $definition['domain'], 'kind' => $definition['kind'], 'formats' => $definition['formats'], 'range' => $definition['range'] ?? false];
            }
        }

        return $visible;
    }

    /** The report's Thai title as its files print it — the ticket overview names itself in its own PDF view. */
    public static function title(string $key): string
    {
        return $key === self::TICKETS_OVERVIEW ? 'รายงานภาพรวม Ticket & SLA' : (self::tabular($key)?->title() ?? $key);
    }

    /** The tabular definition behind a catalogue key, or null when the key is unknown or not tabular. */
    public static function tabular(string $key): ?TabularReport
    {
        $definition = self::definitions()[$key] ?? null;

        return ($definition['kind'] ?? null) === 'tabular' ? app($definition['class']) : null;
    }
}
