/**
 * Report module HTTP calls — Report Center catalogue, the Ticket & SLA report
 * (summary, rows, file export) and the generic tabular reports (definition, rows, export).
 */
import { http } from '@/shared/lib/http';
import type {
    ExportFormat,
    PagedRows,
    ReportDefinition,
    ReportSnapshot,
    SnapshotPeriod,
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

    snapshot: (period: SnapshotPeriod) => http.get<{ data: ReportSnapshot }>('/reports/snapshot', { params: { period } }).then((r) => r.data.data),

    pin: (key: string) => http.put(`/reports/${key}/pin`),

    unpin: (key: string) => http.delete(`/reports/${key}/pin`),

    ticketOverview: (f: TicketReportFilters) =>
        http.get<{ data: TicketOverviewSummary }>('/reports/tickets/overview', { params: ticketParams(f) }).then((r) => r.data.data),

    ticketOverviewRows: (f: TicketReportFilters, page: number, perPage: number) =>
        http
            .get<PagedRows<TicketReportRow>>('/reports/tickets/overview/rows', { params: { ...ticketParams(f), page, per_page: perPage } })
            .then((r) => r.data),

    exportTicketOverview: (f: TicketReportFilters, format: ExportFormat) =>
        http.get('/reports/tickets/overview/export', { params: { ...ticketParams(f), format }, responseType: 'blob' }).then((r) => ({
            blob: r.data as Blob,
            filename: filenameFrom(r.headers['content-disposition']) ?? `TicketReport.${format}`,
        })),

    tabularDefinition: (key: string) => http.get<{ data: TabularDefinition }>(`/reports/r/${key}`).then((r) => r.data.data),

    tabularRows: (key: string, filters: TabularFilters, page: number, perPage: number) =>
        http.get<TabularRows>(`/reports/r/${key}/rows`, { params: { ...tabularParams(filters), page, per_page: perPage } }).then((r) => r.data),

    /** `columns` = the keys the page's column picker keeps; omitted when every column shows. */
    exportTabular: (key: string, filters: TabularFilters, format: ExportFormat, columns?: string[]) =>
        http.get(`/reports/r/${key}/export`, { params: { ...tabularParams(filters), format, columns }, responseType: 'blob' }).then((r) => ({
            blob: r.data as Blob,
            filename: filenameFrom(r.headers['content-disposition']) ?? `Report.${format}`,
        })),
};
