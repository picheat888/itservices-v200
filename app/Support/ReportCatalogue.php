<?php

namespace App\Support;

use App\Models\User;
use App\Services\Report\Access\AccessOverviewReport;
use App\Services\Report\Access\AccessResourceMembersReport;
use App\Services\Report\Access\SoftwareLicenseReport;
use App\Services\Report\Asset\AssetOverviewReport;
use App\Services\Report\Asset\AssetTransferHistoryReport;
use App\Services\Report\Asset\AssetWriteoffReport;
use App\Services\Report\Asset\WarrantyExpiringReport;
use App\Services\Report\Contract\ContractOverviewReport;
use App\Services\Report\Contract\ContractRenewalsReport;
use App\Services\Report\Contract\ContractRentalsReport;
use App\Services\Report\Employee\EmployeeOpenItemsReport;
use App\Services\Report\Employee\EmployeeOverviewReport;
use App\Services\Report\Request\ItPendingRequestReport;
use App\Services\Report\Request\RequestApprovalsReport;
use App\Services\Report\Request\RequestOverviewReport;
use App\Services\Report\Stock\StockBelowMinReport;
use App\Services\Report\Stock\StockMovementReport;
use App\Services\Report\Stock\StockValuationReport;
use App\Services\Report\Tabular\TabularReport;
use App\Services\Report\Ticket\TicketBacklogReport;
use App\Services\Report\Ticket\TicketManualSlaReport;
use App\Services\Report\Ticket\TicketRequestSlaReport;

/**
 * Registry of every report in the Report Center (/reports).
 *
 * One entry per report: the domain it belongs to (groups the hub), the reports.* switches
 * a reader must hold ALL of to open it (the master and the domain), and the export formats it offers. The hub list,
 * each report's Form Request authorize() and the sidebar all ask this class, so a
 * report is never listed to someone its endpoint would refuse.
 *
 * `kind` tells the two report styles apart: `custom` reports (Phase 1) ship their own
 * controller/routes; `tabular` reports (Phase 2+) are declared once as a TabularReport
 * class and served entirely by the generic /reports/tabular/{key} endpoints.
 */
class ReportCatalogue
{
    public const TICKETS_OVERVIEW = 'tickets.overview';

    public const TICKETS_BACKLOG = 'tickets.backlog';

    public const TICKETS_REQUEST_SLA = 'tickets.request_sla';

    public const TICKETS_MANUAL_SLA = 'tickets.manual_sla';

    public const ASSETS_OVERVIEW = 'assets.overview';

    public const ASSETS_TRANSFER_HISTORY = 'assets.transfer_history';

    public const ASSETS_WRITEOFFS = 'assets.writeoffs';

    public const CONTRACTS_OVERVIEW = 'contracts.overview';

    public const CONTRACTS_RENEWALS = 'contracts.renewals';

    public const CONTRACTS_RENTALS = 'contracts.rentals';

    public const ASSETS_WARRANTY_EXPIRING = 'assets.warranty_expiring';

    public const STOCK_MOVEMENTS = 'stock.movements';

    public const STOCK_BELOW_MIN = 'stock.below_min';

    public const STOCK_VALUATION = 'stock.valuation';

    public const REQUESTS_OVERVIEW = 'requests.overview';

    public const REQUESTS_APPROVALS = 'requests.approvals';

    public const REQUESTS_IT_PENDING = 'requests.it_pending';

    public const EMPLOYEES_OVERVIEW = 'employees.overview';

    public const EMPLOYEES_OPEN_ITEMS = 'employees.open_items';

    public const ACCESS_OVERVIEW = 'access.overview';

    public const ACCESS_RESOURCE_MEMBERS = 'access.resource_members';

    public const ACCESS_SOFTWARE_LICENSES = 'access.software_licenses';

    /**
     * @return array<string, array{domain: string, kind: string, class?: class-string<TabularReport>, requires: list<string>, formats: list<string>, range?: bool}>
     */
    public static function definitions(): array
    {
        return [
            // Ticket reports keep to the reader's tickets.level_* categories.
            self::TICKETS_OVERVIEW => [
                'domain' => 'tickets',
                'kind' => 'custom',
                'requires' => ['reports.module', 'reports.tickets'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            self::TICKETS_BACKLOG => [
                'domain' => 'tickets',
                'kind' => 'tabular',
                'class' => TicketBacklogReport::class,
                'requires' => ['reports.module', 'reports.tickets'],
                'formats' => ['xlsx', 'pdf'],
            ],
            // Tickets opened from approved requests, judged per request type.
            self::TICKETS_REQUEST_SLA => [
                'domain' => 'tickets',
                'kind' => 'tabular',
                'class' => TicketRequestSlaReport::class,
                'requires' => ['reports.module', 'reports.tickets'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            // Tickets employees opened themselves, judged by the same verdicts and grouped by a
            // dimension the reader picks — the twin of the request report above.
            self::TICKETS_MANUAL_SLA => [
                'domain' => 'tickets',
                'kind' => 'tabular',
                'class' => TicketManualSlaReport::class,
                'requires' => ['reports.module', 'reports.tickets'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            self::CONTRACTS_OVERVIEW => [
                'domain' => 'contracts',
                'kind' => 'tabular',
                'class' => ContractOverviewReport::class,
                'requires' => ['reports.module', 'reports.contracts'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::CONTRACTS_RENEWALS => [
                'domain' => 'contracts',
                'kind' => 'tabular',
                'class' => ContractRenewalsReport::class,
                'requires' => ['reports.module', 'reports.contracts'],
                'formats' => ['xlsx', 'pdf'],
            ],
            // Hardware contracts only: assets per contract, returns due, rent against buy per model.
            self::CONTRACTS_RENTALS => [
                'domain' => 'contracts',
                'kind' => 'tabular',
                'class' => ContractRentalsReport::class,
                'requires' => ['reports.module', 'reports.contracts'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::ASSETS_OVERVIEW => [
                'domain' => 'assets',
                'kind' => 'tabular',
                'class' => AssetOverviewReport::class,
                'requires' => ['reports.module', 'reports.assets'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::ASSETS_WARRANTY_EXPIRING => [
                'domain' => 'assets',
                'kind' => 'tabular',
                'class' => WarrantyExpiringReport::class,
                'requires' => ['reports.module', 'reports.assets'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::ASSETS_TRANSFER_HISTORY => [
                'domain' => 'assets',
                'kind' => 'tabular',
                'class' => AssetTransferHistoryReport::class,
                'requires' => ['reports.module', 'reports.assets'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            // What was written off within a range (assets.written_off_at).
            self::ASSETS_WRITEOFFS => [
                'domain' => 'assets',
                'kind' => 'tabular',
                'class' => AssetWriteoffReport::class,
                'requires' => ['reports.module', 'reports.assets'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            self::STOCK_MOVEMENTS => [
                'domain' => 'stock',
                'kind' => 'tabular',
                'class' => StockMovementReport::class,
                'requires' => ['reports.module', 'reports.stock'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            self::STOCK_BELOW_MIN => [
                'domain' => 'stock',
                'kind' => 'tabular',
                'class' => StockBelowMinReport::class,
                'requires' => ['reports.module', 'reports.stock'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::STOCK_VALUATION => [
                'domain' => 'stock',
                'kind' => 'tabular',
                'class' => StockValuationReport::class,
                'requires' => ['reports.module', 'reports.stock'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::REQUESTS_OVERVIEW => [
                'domain' => 'requests',
                'kind' => 'tabular',
                'class' => RequestOverviewReport::class,
                'requires' => ['reports.module', 'reports.requests'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            self::REQUESTS_APPROVALS => [
                'domain' => 'requests',
                'kind' => 'tabular',
                'class' => RequestApprovalsReport::class,
                'requires' => ['reports.module', 'reports.requests'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            self::REQUESTS_IT_PENDING => [
                'domain' => 'requests',
                'kind' => 'tabular',
                'class' => ItPendingRequestReport::class,
                'requires' => ['reports.module', 'reports.requests'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::EMPLOYEES_OVERVIEW => [
                'domain' => 'employees',
                'kind' => 'tabular',
                'class' => EmployeeOverviewReport::class,
                'requires' => ['reports.module', 'reports.employees'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            self::EMPLOYEES_OPEN_ITEMS => [
                'domain' => 'employees',
                'kind' => 'tabular',
                'class' => EmployeeOpenItemsReport::class,
                'requires' => ['reports.module', 'reports.employees'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::ACCESS_OVERVIEW => [
                'domain' => 'access',
                'kind' => 'tabular',
                'class' => AccessOverviewReport::class,
                'requires' => ['reports.module', 'reports.access'],
                'formats' => ['xlsx', 'pdf'],
                'range' => true,
            ],
            self::ACCESS_RESOURCE_MEMBERS => [
                'domain' => 'access',
                'kind' => 'tabular',
                'class' => AccessResourceMembersReport::class,
                'requires' => ['reports.module', 'reports.access'],
                'formats' => ['xlsx', 'pdf'],
            ],
            self::ACCESS_SOFTWARE_LICENSES => [
                'domain' => 'access',
                'kind' => 'tabular',
                'class' => SoftwareLicenseReport::class,
                'requires' => ['reports.module', 'reports.access'],
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
