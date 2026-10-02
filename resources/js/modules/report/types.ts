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
export type ReportDomain = 'tickets' | 'assets' | 'contracts' | 'stock' | 'requests' | 'employees' | 'access';
export type ExportFormat = 'xlsx' | 'pdf';

export type ReportExportStatus = 'queued' | 'running' | 'ready' | 'failed';

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';

/** What the schedule dialog sets — the report and its filters come from the page. */
export interface ScheduleInput {
    format: ExportFormat;
    frequency: ScheduleFrequency;
    send_hour: number;
    recipients: string[];
}

/** One scheduled report email (ReportScheduleResource). */
export interface ReportScheduleItem extends ScheduleInput {
    id: number;
    report_key: ReportKey;
    filters: Record<string, unknown>;
    columns: string[] | null;
    active: boolean;
    next_run_at: string | null;
    last_run_at: string | null;
    last_status: 'sent' | 'failed' | null;
    /** forbidden | build_failed | template_disabled | delivery_failed */
    last_error: string | null;
    created_at: string;
}

/** One file on "ไฟล์ส่งออกของฉัน" (ReportExportResource). */
export interface ReportExportItem {
    id: number;
    report_key: ReportKey;
    format: ExportFormat;
    status: ReportExportStatus;
    /** The filters it was built with, and how many columns were picked (null = all). */
    filters: Record<string, unknown>;
    columns_count: number | null;
    file_name: string | null;
    rows_count: number | null;
    size_bytes: number | null;
    /** forbidden | build_failed */
    error: string | null;
    created_at: string;
    finished_at: string | null;
    expires_at: string | null;
}

export interface ReportDefinition {
    key: ReportKey;
    domain: ReportDomain;
    kind: ReportKind;
    formats: ExportFormat[];
    /** Pinned by the current user (ReportPinService). */
    pinned: boolean;
    /** Place in the order the reader pinned reports (0 = pinned first); null when not pinned. */
    pin_order: number | null;
}

/** Period of the hub's number strip — mirrors ReportSnapshotService::PERIODS. */
export type SnapshotPeriod = '7d' | 'month' | 'quarter' | 'year';

/** One tile of the hub's number strip (ReportSnapshotService::tile()). */
export interface SnapshotTile {
    key: string;
    /** The report the tile opens — its number comes from that report. */
    report_key: ReportKey;
    value: number | null;
    /** "x / total" tiles only. */
    total: number | null;
    unit: 'percent' | null;
    /** Change over the period: SLA points against the period before; open tickets since its start. */
    delta: number | null;
    secondary: { key: string; value: number | null } | null;
    /** The value across the period (7 points; null = nothing measured there) — the sparkline. */
    trend: (number | null)[] | null;
}

export interface ReportSnapshot {
    period: SnapshotPeriod;
    from: string;
    to: string;
    tiles: SnapshotTile[];
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
    previous: { from: string; to: string; total: number; sla_rate: number | null; median_resolve_hours: number | null };
    backlog: { open: number; in_progress: number; breached: number; aging: { d1: number; d3: number; d7: number; older: number } };
    weekly: { week_start: string; opened: number; closed: number; backlog: number }[];
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
    requester_name_th: string | null;
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
    /** The rows response carries charts — the page holds their place while it loads. */
    has_charts: boolean;
    /** False when the charts already say what the table would — the page then lists no rows. */
    shows_table: boolean;
}

/** Filter values keyed by `TabularFilterDef.name`; null/'' means "not set". */
export type TabularFilters = Record<string, string | number | null>;

export interface SummaryItem {
    key: string;
    label_key: string;
    value: number | null;
    tone: 'amber' | 'red' | 'green' | null;
    /** 'count' (default, plain integer) | 'money' (2 decimals, locale grouping). */
    format: 'count' | 'money';
}

/** A chart colour, drawn by tabular-charts.tsx. */
export type ChartTone = 'green' | 'blue' | 'violet' | 'orange' | 'amber' | 'red' | 'gray';

/** A row's name from master data — the reader's language when it has one. */
export interface ChartLabel {
    name: string | null;
    name_th: string | null;
}

export interface ChartSeries {
    key: string;
    label_key: string;
    tone: ChartTone;
}

/** Charts a tabular report draws above its table (TabularReport::charts()). */
export type TabularChart =
    | {
          type: 'stacks';
          key: string;
          title_key: string;
          legend: ChartSeries[];
          rows: { label: ChartLabel; values: Record<string, number>; total: number }[];
      }
    | {
          type: 'donut';
          key: string;
          title_key: string;
          center: { value: number | null; label_key: string };
          total: number;
          segments: (ChartSeries & { value: number })[];
      }
    | { type: 'bars'; key: string; title_key: string; rows: { label: ChartLabel; value: number }[] };

export interface TabularRows {
    data: Array<Record<string, unknown> & { id: number }>;
    meta: PagedRows<unknown>['meta'];
    summary: SummaryItem[];
    charts: TabularChart[];
}
