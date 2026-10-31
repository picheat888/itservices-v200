/**
 * Every report page: its address (the report key with "." and "_" made "-"), the permissions its
 * ReportCatalogue entry requires, and its page file in pages/, loaded when first opened.
 */
import { lazyPage } from '@/shared/lib/lazy-page';
import type { ComponentType } from 'react';

const AccessOverviewReportPage = lazyPage(() => import('./pages/access-overview'));
const AccessResourceMembersReportPage = lazyPage(() => import('./pages/access-resource-members'));
const AccessSoftwareLicensesReportPage = lazyPage(() => import('./pages/access-software-licenses'));
const AssetsOverviewReportPage = lazyPage(() => import('./pages/assets-overview'));
const AssetsTransferHistoryReportPage = lazyPage(() => import('./pages/assets-transfer-history'));
const AssetsWarrantyExpiringReportPage = lazyPage(() => import('./pages/assets-warranty-expiring'));
const AssetsWriteoffsReportPage = lazyPage(() => import('./pages/assets-writeoffs'));
const ContractsOverviewReportPage = lazyPage(() => import('./pages/contracts-overview'));
const ContractsRenewalsReportPage = lazyPage(() => import('./pages/contracts-renewals'));
const ContractsRentalsReportPage = lazyPage(() => import('./pages/contracts-rentals'));
const EmployeesOpenItemsReportPage = lazyPage(() => import('./pages/employees-open-items'));
const EmployeesOverviewReportPage = lazyPage(() => import('./pages/employees-overview'));
const RequestsApprovalsReportPage = lazyPage(() => import('./pages/requests-approvals'));
const RequestsItPendingReportPage = lazyPage(() => import('./pages/requests-it-pending'));
const RequestsOverviewReportPage = lazyPage(() => import('./pages/requests-overview'));
const StockBelowMinReportPage = lazyPage(() => import('./pages/stock-below-min'));
const StockMovementsReportPage = lazyPage(() => import('./pages/stock-movements'));
const StockValuationReportPage = lazyPage(() => import('./pages/stock-valuation'));
const TicketsBacklogReportPage = lazyPage(() => import('./pages/tickets-backlog'));
const TicketsManualSlaReportPage = lazyPage(() => import('./pages/tickets-manual-sla'));
const TicketsOverviewReportPage = lazyPage(() => import('./pages/tickets-overview'));
const TicketsRequestSlaReportPage = lazyPage(() => import('./pages/tickets-request-sla'));

export interface ReportPageRoute {
    /** Under /reports — "tickets-overview" opens /reports/tickets-overview. */
    path: string;
    allOf: string[];
    Page: ComponentType;
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
