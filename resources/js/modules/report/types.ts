/**
 * Report module types — the Report Center catalogue, the "Ticket & SLA overview" report
 * (shapes mirror App\Services\Report\TicketOverviewReportService::summary() and
 * App\Http\Resources\Report\TicketReportRowResource) and the generic tabular reports
 * (shapes mirror App\Services\Report\Tabular\{ReportFilter,ReportColumn,ReportSummary}::toArray()
 * and App\Http\Controllers\Api\Report\TabularReportController).
 */

/** 'custom' = a hand-built report (Ticket & SLA overview); 'tabular' = the generic table engine. */
export type ReportKind = 'custom' | 'tabular';
// Widened to `string` because the catalogue now also carries tabular report keys
// (e.g. 'contracts.expiring', 'assets.register', 'assets.warranty_expiring').
export type ReportKey = string;
export type ReportDomain = 'tickets' | 'assets' | 'contracts';
export type ExportFormat = 'xlsx' | 'pdf';

export interface ReportDefinition {
    key: ReportKey;
    domain: ReportDomain;
    kind: ReportKind;
    formats: ExportFormat[];
}

export interface TicketReportFilters {
    /** YYYY-MM-DD */
    from: string;
    /** YYYY-MM-DD */
    to: string;
    categories: string[];
    /** '' = every priority */
    priority: string;
    department_id: number | null;
    assignee_id: number | null;
}

export interface TicketOverviewSummary {
    range: { from: string; to: string };
    generated_at: string;
    sla_goal: number;
    kpi: {
        total: number;
        completed: number;
        canceled: number;
        sla_measured: number;
        sla_met: number;
        sla_rate: number | null;
        median_resolve_hours: number | null;
        p90_resolve_hours: number | null;
    };
    previous: { from: string; to: string; total: number; sla_rate: number | null };
    backlog: { open: number; in_progress: number; breached: number; aging: { d1: number; d3: number; d7: number; older: number } };
    weekly: { week_start: string; opened: number; closed: number }[];
    sla_by_priority: { priority: string; measured: number; met: number; rate: number | null }[];
    by_category: { category: string; count: number }[];
    by_department: { department_id: number | null; name: string | null; name_th: string | null; count: number; sla_rate: number | null }[];
    by_assignee: { assignee_id: number; name: string | null; completed: number; median_resolve_hours: number | null }[];
    options: {
        departments: { id: number; name: string; name_th: string | null }[];
        assignees: { id: number; name: string }[];
        categories: string[];
    };
}

export interface TicketReportRow {
    id: number;
    ticket_no: string;
    subject: string;
    requester_name: string | null;
    department_name: string | null;
    department_name_th: string | null;
    category: string | null;
    priority: string | null;
    status: string;
    assignee_name: string | null;
    created_at: string | null;
    resolved_at: string | null;
    resolve_hours: number | null;
    sla: 'met' | 'breached' | null;
}

export interface PagedRows<T> {
    data: T[];
    meta: { total: number; per_page: number; current_page: number; last_page: number };
}

// --- Generic tabular reports (Report\Tabular\*) --------------------------------------

export interface FilterOption {
    value: string | number;
    label?: string;
    label_th?: string | null;
    label_key?: string;
}

export interface TabularFilterDef {
    name: string;
    type: 'select' | 'date' | 'search';
    options: FilterOption[];
    default: string | number | null;
    label_key: string;
}

export type ColumnType = 'text' | 'localized' | 'number' | 'money' | 'date' | 'days_left' | 'enum';

export interface TabularColumnDef {
    key: string;
    type: ColumnType;
    label_key: string;
    /** enum columns only: raw value → i18n key. */
    labels?: Record<string, string>;
}

export interface TabularDefinition {
    key: string;
    formats: ExportFormat[];
    filters: TabularFilterDef[];
    columns: TabularColumnDef[];
}

/** Filter values keyed by `TabularFilterDef.name`; null/'' means "not set". */
export type TabularFilters = Record<string, string | number | null>;

export interface SummaryItem {
    key: string;
    label_key: string;
    value: number | null;
    tone: 'amber' | 'red' | 'green' | null;
}

export interface TabularRows {
    data: Array<Record<string, unknown> & { id: number }>;
    meta: PagedRows<unknown>['meta'];
    summary: SummaryItem[];
}
