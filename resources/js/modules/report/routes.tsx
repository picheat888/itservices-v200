/**
 * Every report page of the Report module: its address, who may open it, and the page file that
 * draws it — one line per report, mounted by App.tsx. The address is the report's key with "."
 * and "_" made "-" (report-catalogue.tsx reportSlug), and the file in pages/ has the same name.
 *
 * `anyOf` mirrors the report's own permission in ReportCatalogue (the server still checks every
 * key it requires — e.g. the ticket reports also need tickets.resolve — and answers 403 if not).
 * An address not listed here opens UnknownReportPage.
 */
import type { ComponentType } from 'react';
import AccessSoftwareLicensesReportPage from './pages/access-software-licenses';
import AssetsByStatusDepartmentReportPage from './pages/assets-by-status-department';
import AssetsRegisterReportPage from './pages/assets-register';
import AssetsTransferHistoryReportPage from './pages/assets-transfer-history';
import AssetsWarrantyExpiringReportPage from './pages/assets-warranty-expiring';
import ContractsExpiringReportPage from './pages/contracts-expiring';
import ContractsMonthlyCostReportPage from './pages/contracts-monthly-cost';
import EmployeesJoinersLeaversReportPage from './pages/employees-joiners-leavers';
import EmployeesLeaverAssetsReportPage from './pages/employees-leaver-assets';
import RequestsApprovalTimeReportPage from './pages/requests-approval-time';
import RequestsItPendingReportPage from './pages/requests-it-pending';
import RequestsSummaryReportPage from './pages/requests-summary';
import StockBelowMinReportPage from './pages/stock-below-min';
import StockMovementsReportPage from './pages/stock-movements';
import StockValuationReportPage from './pages/stock-valuation';
import TicketsBacklogReportPage from './pages/tickets-backlog';
import TicketsOverviewReportPage from './pages/tickets-overview';
import TicketsRequestSlaReportPage from './pages/tickets-request-sla';

export interface ReportPageRoute {
    /** Under /reports — "tickets-overview" opens /reports/tickets-overview. */
    path: string;
    anyOf: string[];
    Page: ComponentType;
}

export const reportPageRoutes: ReportPageRoute[] = [
    // Tickets
    { path: 'tickets-overview', anyOf: ['tickets.view_all'], Page: TicketsOverviewReportPage },
    { path: 'tickets-backlog', anyOf: ['tickets.view_all'], Page: TicketsBacklogReportPage },
    { path: 'tickets-request-sla', anyOf: ['tickets.view_all'], Page: TicketsRequestSlaReportPage },
    // Assets
    { path: 'assets-register', anyOf: ['assets.view'], Page: AssetsRegisterReportPage },
    { path: 'assets-warranty-expiring', anyOf: ['assets.view'], Page: AssetsWarrantyExpiringReportPage },
    { path: 'assets-by-status-department', anyOf: ['assets.view'], Page: AssetsByStatusDepartmentReportPage },
    { path: 'assets-transfer-history', anyOf: ['assets.view'], Page: AssetsTransferHistoryReportPage },
    // Contracts
    { path: 'contracts-expiring', anyOf: ['contracts.view'], Page: ContractsExpiringReportPage },
    { path: 'contracts-monthly-cost', anyOf: ['contracts.view'], Page: ContractsMonthlyCostReportPage },
    // Stock
    { path: 'stock-movements', anyOf: ['stock.view_events'], Page: StockMovementsReportPage },
    { path: 'stock-below-min', anyOf: ['stock.view'], Page: StockBelowMinReportPage },
    { path: 'stock-valuation', anyOf: ['stock.view'], Page: StockValuationReportPage },
    // Requests
    { path: 'requests-summary', anyOf: ['requests.view_all'], Page: RequestsSummaryReportPage },
    { path: 'requests-approval-time', anyOf: ['requests.view_all'], Page: RequestsApprovalTimeReportPage },
    { path: 'requests-it-pending', anyOf: ['requests.view_all'], Page: RequestsItPendingReportPage },
    // Employees
    { path: 'employees-joiners-leavers', anyOf: ['employees.view'], Page: EmployeesJoinersLeaversReportPage },
    { path: 'employees-leaver-assets', anyOf: ['employees.view'], Page: EmployeesLeaverAssetsReportPage },
    // Access
    { path: 'access-software-licenses', anyOf: ['access.software_view'], Page: AccessSoftwareLicensesReportPage },
];
