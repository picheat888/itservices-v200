/**
 * Report module HTTP calls — Report Center catalogue, the Ticket & SLA report
 * (summary, rows, queued export), the generic tabular reports (definition, rows, queued export)
 * "ไฟล์ส่งออกของฉัน" (list, download, retry, remove) and scheduled report emails (set, list, edit, send now, remove).
 */
import { http } from '@/shared/lib/http';
import type {
    BacklogBoardTicket,
    ExportFormat,
    PagedRows,
    ReportDefinition,
    ReportExportItem,
    ReportScheduleItem,
    ReportSnapshot,
    RequestSlaBreakdown,
    ScheduleInput,
    SnapshotRange,
    TabularDefinition,
    TabularFilters,
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

    tabularDefinition: (key: string) => http.get<{ data: TabularDefinition }>(`/reports/r/${key}`).then((r) => r.data.data),

    tabularRows: (key: string, filters: TabularFilters, page: number, perPage: number) =>
        http.get<TabularRows>(`/reports/r/${key}/rows`, { params: { ...tabularParams(filters), page, per_page: perPage } }).then((r) => r.data),

    /** Queues the file (202). `columns` = the keys the page's column picker keeps; omitted when every column shows. */
    exportTabular: (key: string, filters: TabularFilters, format: ExportFormat, columns?: string[]) =>
        http
            .post<{ data: ReportExportItem }>(`/reports/r/${key}/export`, null, { params: { ...tabularParams(filters), format, columns } })
            .then((r) => r.data.data),

    myExports: () => http.get<{ data: ReportExportItem[] }>('/reports/exports').then((r) => r.data.data),

    downloadExport: (item: ReportExportItem) =>
        http.get(`/reports/exports/${item.id}/download`, { responseType: 'blob' }).then((r) => ({
            blob: r.data as Blob,
            filename: filenameFrom(r.headers['content-disposition']) ?? item.file_name ?? `Report.${item.format}`,
        })),

    retryExport: (id: number) => http.post<{ data: ReportExportItem }>(`/reports/exports/${id}/retry`).then((r) => r.data.data),

    deleteExport: (id: number) => http.delete(`/reports/exports/${id}`),

    /** Set a schedule from a tabular report page — its filters and column picker travel with it. */
    scheduleTabular: (key: string, filters: TabularFilters, input: ScheduleInput, columns?: string[]) =>
        http
            .post<{ data: ReportScheduleItem }>(`/reports/r/${key}/schedule`, { ...tabularParams(filters), columns, ...input })
            .then((r) => r.data.data),

    scheduleTicketOverview: (f: TicketReportFilters, input: ScheduleInput) =>
        http.post<{ data: ReportScheduleItem }>('/reports/tickets/overview/schedule', { ...ticketParams(f), ...input }).then((r) => r.data.data),

    schedules: () => http.get<{ data: ReportScheduleItem[] }>('/reports/schedules').then((r) => r.data.data),

    updateSchedule: (id: number, patch: Partial<ScheduleInput> & { active?: boolean }) =>
        http.put<{ data: ReportScheduleItem }>(`/reports/schedules/${id}`, patch).then((r) => r.data.data),

    deleteSchedule: (id: number) => http.delete(`/reports/schedules/${id}`),

    sendScheduleNow: (id: number) => http.post(`/reports/schedules/${id}/send-now`),
};
