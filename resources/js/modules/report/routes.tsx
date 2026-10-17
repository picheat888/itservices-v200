/**
 * Every report page of the Report module: its address, who may open it, and the page file that
 * draws it — one line per report, mounted by App.tsx. The address is the report's key with "."
 * and "_" made "-" (report-catalogue.tsx reportSlug), and the file in pages/ has the same name.
 *
 * `allOf` is every permission the report's ReportCatalogue entry requires, so the page opens exactly
 * when its data does.
 * An address not listed here opens UnknownReportPage.
 */
import type { ComponentType } from 'react';
import AccessOverviewReportPage from './pages/access-overview';
import AccessResourceMembersReportPage from './pages/access-resource-members';
import AccessSoftwareLicensesReportPage from './pages/access-software-licenses';
import AssetsOverviewReportPage from './pages/assets-overview';
import AssetsTransferHistoryReportPage from './pages/assets-transfer-history';
import AssetsWarrantyExpiringReportPage from './pages/assets-warranty-expiring';
import AssetsWriteoffsReportPage from './pages/assets-writeoffs';
import ContractsOverviewReportPage from './pages/contracts-overview';
import ContractsRenewalsReportPage from './pages/contracts-renewals';
import ContractsRentalsReportPage from './pages/contracts-rentals';
import EmployeesOpenItemsReportPage from './pages/employees-open-items';
import EmployeesOverviewReportPage from './pages/employees-overview';
import RequestsApprovalsReportPage from './pages/requests-approvals';
import RequestsItPendingReportPage from './pages/requests-it-pending';
import RequestsOverviewReportPage from './pages/requests-overview';
import StockBelowMinReportPage from './pages/stock-below-min';
import StockMovementsReportPage from './pages/stock-movements';
import StockValuationReportPage from './pages/stock-valuation';
import TicketsBacklogReportPage from './pages/tickets-backlog';
import TicketsManualSlaReportPage from './pages/tickets-manual-sla';
import TicketsOverviewReportPage from './pages/tickets-overview';
import TicketsRequestSlaReportPage from './pages/tickets-request-sla';

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
