/**
 * Report module HTTP calls — Report Center catalogue, the Ticket & SLA report
 * (summary, rows, queued export), the generic tabular reports (definition, rows, queued export)
 * "ไฟล์ส่งออกของฉัน" (list, download, retry, remove) and scheduled report emails (set, list, edit, send now, remove).
 */
import { http } from '@/shared/lib/http';
import type {
    AccessMembersBreakdown,
    AccessOverviewBreakdown,
    AssetTransferBreakdown,
    AssetWarrantyBreakdown,
    AssetWriteoffBreakdown,
    BacklogBoardTicket,
    ContractOverviewBreakdown,
    ContractRenewalsBreakdown,
    ContractRentalsBreakdown,
    EmployeeOpenItemsBreakdown,
    EmployeeOverviewBreakdown,
    ExportFormat,
    ItPendingBreakdown,
    ManagedScheduleItem,
    ManualSlaBreakdown,
    PagedRows,
    ReportDefinition,
    ReportExportItem,
    ReportScheduleItem,
    ReportSnapshot,
    RequestApprovalsBreakdown,
    RequestOverviewBreakdown,
    RequestSlaBreakdown,
    ScheduleInput,
    SnapshotRange,
    SoftwareLicenseBreakdown,
    StockLevelsBreakdown,
    StockMovementsBreakdown,
    StockValuationBreakdown,
    TabularDefinition,
    TabularFilters,
    TabularHeadline,
    TabularRows,
    TicketOverviewSummary,
    TicketReportFilters,
    TicketReportRow,
} from '../types';

/** Drop unset filters so the query string only carries what the user picked. */
function ticketParams(f: TicketReportFilters) {
    return {
        from: f.from,
        to: f.to,
        categories: f.categories.length ? f.categories : undefined,
        priority: f.priority || undefined,
        department_id: f.department_id ?? undefined,
        assignee_id: f.assignee_id ?? undefined,
        source: f.source || undefined,
    };
}

/** filename="…" or filename*=UTF-8''… from a Content-Disposition header. */
function filenameFrom(disposition: string | undefined): string | null {
    if (!disposition) return null;
    const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (star) return decodeURIComponent(star[1]);
    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    return plain ? plain[1] : null;
}

/** Drop null/'' filter values so the query string only carries what the reader picked. */
function tabularParams(f: TabularFilters) {
    return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== null && v !== ''));
}

export const reportApi = {
    catalogue: () => http.get<{ data: ReportDefinition[] }>('/reports').then((r) => r.data.data),

    snapshot: (range: SnapshotRange) => http.get<{ data: ReportSnapshot }>('/reports/snapshot', { params: range }).then((r) => r.data.data),

    pin: (key: string) => http.put(`/reports/${key}/pin`),

    unpin: (key: string) => http.delete(`/reports/${key}/pin`),

    ticketOverview: (f: TicketReportFilters) =>
        http.get<{ data: TicketOverviewSummary }>('/reports/tickets/overview', { params: ticketParams(f) }).then((r) => r.data.data),

    ticketOverviewRows: (f: TicketReportFilters, page: number, perPage: number) =>
        http
            .get<PagedRows<TicketReportRow>>('/reports/tickets/overview/rows', { params: { ...ticketParams(f), page, per_page: perPage } })
            .then((r) => r.data),

    /** Queues the file (202); it is built on the worker and appears in the exports list. */
    exportTicketOverview: (f: TicketReportFilters, format: ExportFormat) =>
        http
            .post<{ data: ReportExportItem }>('/reports/tickets/overview/export', null, { params: { ...ticketParams(f), format } })
            .then((r) => r.data.data),

    /** Every live ticket the backlog filters keep (SLA filter aside), unpaged — the due board. */
    backlogBoard: (filters: TabularFilters) =>
        http.get<{ data: BacklogBoardTicket[] }>('/reports/tickets/backlog/board', { params: tabularParams(filters) }).then((r) => r.data.data),

    /** "สรุปผล SLA ของ Ticket จากคำขอ": the per-type table, the still-open list and the SLA rules (request type filter aside). */
    requestSlaBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: RequestSlaBreakdown }>('/reports/tickets/request-sla/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "สรุปผล SLA ของ Ticket ที่ผู้ใช้เปิดเอง": the grouped table, the still-open list, lateness and the SLA rules. */
    manualSlaBreakdown: (filters: TabularFilters) =>
        http.get<{ data: ManualSlaBreakdown }>('/reports/tickets/manual-sla/breakdown', { params: tabularParams(filters) }).then((r) => r.data.data),

    /** "การตัดจำหน่ายทรัพย์สิน": every month, the reasons, the categories and the rented assets by contract. */
    assetWriteoffBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: AssetWriteoffBreakdown }>('/reports/assets/writeoffs/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "ประวัติโอนย้ายและรับคืน": every month, acceptance, warehouses, departments, categories and the assets waiting now. */
    assetTransferBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: AssetTransferBreakdown }>('/reports/assets/transfer-history/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "ภาพรวมและค่าใช้จ่ายสัญญา": tiles, bills over the next 12 months, yearly cost by type and cycle, and vendors. */
    contractOverviewBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: ContractOverviewBreakdown }>('/reports/contracts/overview/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "ต่ออายุและสิ้นสุดสัญญา": tiles, contracts ending each month, time left and closed contracts. */
    contractRenewalsBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: ContractRenewalsBreakdown }>('/reports/contracts/renewals/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "สัญญาเช่าและทรัพย์สิน": tiles, asset status per contract and rent against buy per model. */
    contractRentalsBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: ContractRentalsBreakdown }>('/reports/contracts/rentals/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "รับเข้าและเบิกจ่าย": tiles, 12 months in and out, waiting requests, top requesters and count variance. */
    stockMovementsBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: StockMovementsBreakdown }>('/reports/stock/movements/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "มูลค่าคงคลัง": tiles, value by category and by warehouse, and dead stock at the chosen day. */
    stockValuationBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: StockValuationBreakdown }>('/reports/stock/valuation/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "ต่ำกว่าขั้นต่ำและเกินขั้นสูง": tiles and items outside min/max by category. */
    stockLevelsBreakdown: (filters: TabularFilters) =>
        http.get<{ data: StockLevelsBreakdown }>('/reports/stock/below-min/breakdown', { params: tabularParams(filters) }).then((r) => r.data.data),

    /** "ประกันใกล้หมดอายุ": the next 12 months, time left, and the categories and vendors in periods. */
    assetWarrantyBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: AssetWarrantyBreakdown }>('/reports/assets/warranty-expiring/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "ภาพรวมสิทธิ์การเข้าถึง": months, leavers still holding, departments and resources that need someone. */
    accessOverviewBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: AccessOverviewBreakdown }>('/reports/access/overview/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "ภาพรวมพนักงาน": headcount line, departments and leavers still holding access. */
    employeeOverviewBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: EmployeeOverviewBreakdown }>('/reports/employees/overview/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "สรุปเรื่องค้างของพนักงาน": leaver assets, leaver access, accounts and incomplete data as of today. */
    employeeOpenItemsBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: EmployeeOpenItemsBreakdown }>('/reports/employees/open-items/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "ภาพรวมคำขอ": months, types by status, days to delivery, items asked for and departments. */
    requestOverviewBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: RequestOverviewBreakdown }>('/reports/requests/overview/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "ตรวจสอบสมาชิกและเจ้าของ": the resource table, segment counts and the picked resource's review sheet. */
    accessMembersBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: AccessMembersBreakdown }>('/reports/access/resource-members/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** One resource's review sheet as a PDF ("type:id"). */
    accessReviewSheet: (resource: string) =>
        http.get('/reports/access/resource-members/sheet', { params: { resource }, responseType: 'blob' }).then((r) => ({
            blob: r.data as Blob,
            filename: filenameFrom(r.headers['content-disposition']) ?? 'AccessReview.pdf',
        })),

    /** "การใช้ License ซอฟต์แวร์": seats per software, leavers to take seats back from, requests waiting. */
    softwareLicenseBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: SoftwareLicenseBreakdown }>('/reports/access/software-licenses/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "การอนุมัติคำขอ": waiting now and why, each approver's speed, ended requests, skipped steps. */
    requestApprovalsBreakdown: (filters: TabularFilters) =>
        http
            .get<{ data: RequestApprovalsBreakdown }>('/reports/requests/approvals/breakdown', { params: tabularParams(filters) })
            .then((r) => r.data.data),

    /** "คำขอที่รอ IT ส่งมอบ": age groups with owners, the 30-day flow, by assignee, by type, new joiners. */
    itPendingBreakdown: (filters: TabularFilters) =>
        http.get<{ data: ItPendingBreakdown }>('/reports/requests/it-pending/breakdown', { params: tabularParams(filters) }).then((r) => r.data.data),

    tabularDefinition: (key: string) => http.get<{ data: TabularDefinition }>(`/reports/tabular/${key}`).then((r) => r.data.data),

    tabularRows: (key: string, filters: TabularFilters, page: number, perPage: number) =>
        http
            .get<TabularRows>(`/reports/tabular/${key}/rows`, { params: { ...tabularParams(filters), page, per_page: perPage, only_rows: 1 } })
            .then((r) => r.data),

    /** The headline numbers and charts for a filter set — fetched once, not on every page turn. */
    tabularSummary: (key: string, filters: TabularFilters) =>
        http.get<{ data: TabularHeadline }>(`/reports/tabular/${key}/summary`, { params: tabularParams(filters) }).then((r) => r.data.data),

    /** Queues the file (202). `columns` = the keys the page's column picker keeps; omitted when every column shows. */
    exportTabular: (key: string, filters: TabularFilters, format: ExportFormat, columns?: string[]) =>
        http
            .post<{ data: ReportExportItem }>(`/reports/tabular/${key}/export`, null, { params: { ...tabularParams(filters), format, columns } })
            .then((r) => r.data.data),

    myExports: () => http.get<{ data: ReportExportItem[] }>('/reports/exports').then((r) => r.data.data),

    downloadExport: (item: ReportExportItem) =>
        http.get(`/reports/exports/${item.id}/download`, { responseType: 'blob' }).then((r) => ({
            blob: r.data as Blob,
            filename: filenameFrom(r.headers['content-disposition']) ?? item.file_name ?? `Report.${item.format}`,
        })),

    retryExport: (id: number) => http.post<{ data: ReportExportItem }>(`/reports/exports/${id}/retry`).then((r) => r.data.data),

    deleteExport: (id: number) => http.delete(`/reports/exports/${id}`),
    /** Every finished file of the reader's own ("ลบทั้งหมด"); ones still being built stay. */
    deleteAllExports: () => http.delete('/reports/exports'),

    /** Set a schedule from a tabular report page — its filters and column picker travel with it. */
    scheduleTabular: (key: string, filters: TabularFilters, input: ScheduleInput, columns?: string[]) =>
        http
            .post<{ data: ReportScheduleItem }>(`/reports/tabular/${key}/schedule`, { ...tabularParams(filters), columns, ...input })
            .then((r) => r.data.data),

    scheduleTicketOverview: (f: TicketReportFilters, input: ScheduleInput) =>
        http.post<{ data: ReportScheduleItem }>('/reports/tickets/overview/schedule', { ...ticketParams(f), ...input }).then((r) => r.data.data),

    schedules: () => http.get<{ data: ReportScheduleItem[] }>('/reports/schedules').then((r) => r.data.data),

    updateSchedule: (id: number, patch: Partial<ScheduleInput> & { active?: boolean }) =>
        http.put<{ data: ReportScheduleItem }>(`/reports/schedules/${id}`, patch).then((r) => r.data.data),

    deleteSchedule: (id: number) => http.delete(`/reports/schedules/${id}`),

    sendScheduleNow: (id: number) => http.post(`/reports/schedules/${id}/send-now`),

    /** Everyone's schedules, for an admin with reports.schedule_manage. */
    managedSchedules: () => http.get<{ data: ManagedScheduleItem[] }>('/reports/schedules/manage').then((r) => r.data.data),

    setManagedScheduleActive: (id: number, active: boolean) =>
        http.patch<{ data: ManagedScheduleItem }>(`/reports/schedules/${id}/manage`, { active }).then((r) => r.data.data),

    deleteManagedSchedule: (id: number) => http.delete(`/reports/schedules/${id}/manage`),

    removeScheduleRecipient: (id: number, email: string) =>
        http.delete<{ data: ManagedScheduleItem }>(`/reports/schedules/${id}/recipients`, { params: { email } }).then((r) => r.data.data),
};
