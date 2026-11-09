/**
 * Every report page: its address (the report key with "." and "_" made "-"), the permissions its
 * ReportCatalogue entry requires, and its page file in this folder, loaded when first opened.
 */
import { lazyPage, type LazyPage } from '@/shared/lib/lazy-page';

const AccessOverviewReportPage = lazyPage(() => import('./access-overview'));
const AccessResourceMembersReportPage = lazyPage(() => import('./access-resource-members'));
const AccessSoftwareLicensesReportPage = lazyPage(() => import('./access-software-licenses'));
const AssetsOverviewReportPage = lazyPage(() => import('./assets-overview'));
const AssetsTransferHistoryReportPage = lazyPage(() => import('./assets-transfer-history'));
const AssetsWarrantyExpiringReportPage = lazyPage(() => import('./assets-warranty-expiring'));
const AssetsWriteoffsReportPage = lazyPage(() => import('./assets-writeoffs'));
const ContractsOverviewReportPage = lazyPage(() => import('./contracts-overview'));
const ContractsRenewalsReportPage = lazyPage(() => import('./contracts-renewals'));
const ContractsRentalsReportPage = lazyPage(() => import('./contracts-rentals'));
const EmployeesOpenItemsReportPage = lazyPage(() => import('./employees-open-items'));
const EmployeesOverviewReportPage = lazyPage(() => import('./employees-overview'));
const RequestsApprovalsReportPage = lazyPage(() => import('./requests-approvals'));
const RequestsItPendingReportPage = lazyPage(() => import('./requests-it-pending'));
const RequestsOverviewReportPage = lazyPage(() => import('./requests-overview'));
const StockBelowMinReportPage = lazyPage(() => import('./stock-below-min'));
const StockMovementsReportPage = lazyPage(() => import('./stock-movements'));
const StockValuationReportPage = lazyPage(() => import('./stock-valuation'));
const TicketsBacklogReportPage = lazyPage(() => import('./tickets-backlog'));
const TicketsManualSlaReportPage = lazyPage(() => import('./tickets-manual-sla'));
const TicketsOverviewReportPage = lazyPage(() => import('./tickets-overview'));
const TicketsRequestSlaReportPage = lazyPage(() => import('./tickets-request-sla'));

export interface ReportPageRoute {
    /** Under /reports — "tickets-overview" opens /reports/tickets-overview. */
    path: string;
    allOf: string[];
    Page: LazyPage;
}

export const reportPageRoutes: ReportPageRoute[] = [
    // Tickets
    { path: 'tickets-overview', allOf: ['reports.module', 'reports.tickets'], Page: TicketsOverviewReportPage },
    { path: 'tickets-backlog', allOf: ['reports.module', 'reports.tickets'], Page: TicketsBacklogReportPage },
    { path: 'tickets-request-sla', allOf: ['reports.module', 'reports.tickets'], Page: TicketsRequestSlaReportPage },
    { path: 'tickets-manual-sla', allOf: ['reports.module', 'reports.tickets'], Page: TicketsManualSlaReportPage },
    // Assets
    { path: 'assets-warranty-expiring', allOf: ['reports.module', 'reports.assets'], Page: AssetsWarrantyExpiringReportPage },
    { path: 'assets-overview', allOf: ['reports.module', 'reports.assets'], Page: AssetsOverviewReportPage },
    { path: 'assets-transfer-history', allOf: ['reports.module', 'reports.assets'], Page: AssetsTransferHistoryReportPage },
    { path: 'assets-writeoffs', allOf: ['reports.module', 'reports.assets'], Page: AssetsWriteoffsReportPage },
    // Contracts
    { path: 'contracts-overview', allOf: ['reports.module', 'reports.contracts'], Page: ContractsOverviewReportPage },
    { path: 'contracts-renewals', allOf: ['reports.module', 'reports.contracts'], Page: ContractsRenewalsReportPage },
    { path: 'contracts-rentals', allOf: ['reports.module', 'reports.contracts'], Page: ContractsRentalsReportPage },
    // Stock
    { path: 'stock-movements', allOf: ['reports.module', 'reports.stock'], Page: StockMovementsReportPage },
    { path: 'stock-below-min', allOf: ['reports.module', 'reports.stock'], Page: StockBelowMinReportPage },
    { path: 'stock-valuation', allOf: ['reports.module', 'reports.stock'], Page: StockValuationReportPage },
    // Requests
    { path: 'requests-overview', allOf: ['reports.module', 'reports.requests'], Page: RequestsOverviewReportPage },
    { path: 'requests-approvals', allOf: ['reports.module', 'reports.requests'], Page: RequestsApprovalsReportPage },
    { path: 'requests-it-pending', allOf: ['reports.module', 'reports.requests'], Page: RequestsItPendingReportPage },
    // Employees
    { path: 'employees-overview', allOf: ['reports.module', 'reports.employees'], Page: EmployeesOverviewReportPage },
    { path: 'employees-open-items', allOf: ['reports.module', 'reports.employees'], Page: EmployeesOpenItemsReportPage },
    // Access
    { path: 'access-overview', allOf: ['reports.module', 'reports.access'], Page: AccessOverviewReportPage },
    { path: 'access-resource-members', allOf: ['reports.module', 'reports.access'], Page: AccessResourceMembersReportPage },
    { path: 'access-software-licenses', allOf: ['reports.module', 'reports.access'], Page: AccessSoftwareLicensesReportPage },
];

/** Starts a report page's download (hub card hover, focus or tap). */
export function preloadReportPage(path: string): void {
    reportPageRoutes.find((route) => route.path === path)?.Page.preload();
}
