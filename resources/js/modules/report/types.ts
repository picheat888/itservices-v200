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
// (e.g. 'contracts.expiring', 'assets.overview', 'assets.warranty_expiring').
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
    /** Has a from/to date range, so a Report Center link may hand it the hub's period (ReportCatalogue). */
    range: boolean;
    /** Pinned by the current user (ReportPinService). */
    pinned: boolean;
    /** Place in the order the reader pinned reports (0 = pinned first); null when not pinned. */
    pin_order: number | null;
}

/** Period of the hub's number strip — mirrors ReportSnapshotService::PERIODS. */
export type SnapshotPeriod = '7d' | '30d' | '90d' | 'custom';

/** A preset period: the last 7, 30 or 90 days up to today. */
export type SnapshotPreset = Exclude<SnapshotPeriod, 'custom'>;

/** What the hub's period switch holds — a preset, or the reader's own from / to ("YYYY-MM-DD"). */
export type SnapshotRange = { period: SnapshotPreset } | { period: 'custom'; from: string; to: string };

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
    /** '' = every ticket · 'manual' = opened by a person · 'auto_request' = opened by an approved request */
    source: string;
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
        avg_resolve_hours: number | null;
        p90_resolve_hours: number | null;
    };
    previous: { from: string; to: string; total: number; sla_rate: number | null; avg_resolve_hours: number | null };
    backlog: { open: number; in_progress: number; over_sla: number; aging: { d1: number; d3: number; d7: number; older: number } };
    weekly: { week_start: string; opened: number; closed: number; backlog: number }[];
    sla_by_priority: { priority: string; measured: number; met: number; rate: number | null }[];
    by_category: { category: string; count: number }[];
    /** Every requesting department, busiest first; the no-department row (department_id null) comes last. */
    by_department: {
        department_id: number | null;
        name: string | null;
        name_th: string | null;
        count: number;
        /** category value → tickets; categories with none are absent */
        categories: Record<string, number>;
        /** still open or in progress */
        open: number;
        sla_measured: number;
        sla_met: number;
        sla_rate: number | null;
    }[];
    /** Every IT staff member who closed something inside the range (by resolved_at) — the period only. Most closed first. */
    by_assignee: {
        assignee_id: number;
        name: string | null;
        /** completed + canceled in the range */
        total: number;
        completed: number;
        canceled: number;
        avg_resolve_hours: number | null;
        sla_measured: number;
        sla_met: number;
        sla_rate: number | null;
    }[];
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
    /** tickets.source — 'manual' | 'auto_request' */
    source: string | null;
    assignee_name: string | null;
    created_at: string | null;
    resolved_at: string | null;
    resolve_hours: number | null;
    sla: 'met' | 'over_sla' | null;
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

export type ColumnType = 'text' | 'localized' | 'number' | 'money' | 'date' | 'datetime' | 'days_left' | 'hours_left' | 'enum';

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
    /** Amber / red also mark the tile as needing attention. */
    tone:
        | 'amber'
        | 'red'
        | 'green'
        | 'violet'
        | 'blue'
        | 'soft-amber'
        | 'soft-red'
        | 'soft-green'
        | 'soft-violet'
        | 'soft-blue'
        // an asset status — its badge takes the Settings colour itself
        | 'asset-deployed'
        | 'asset-ready'
        | 'asset-pending-acceptance'
        | 'asset-common'
        | 'asset-pending-return'
        | 'asset-writeoff'
        | null;
    /** 'count' (default, plain integer) | 'money' (2 decimals, locale grouping) | 'percent' (whole %) | 'hours' (one decimal). */
    format: 'count' | 'money' | 'percent' | 'hours';
    /** Optional breakdown for the tile's footer ("ซื้อ 62 · เช่า 18"). */
    split?: { key: string; label_key: string; tone: ChartTone; value: number }[];
    /** The value as a percent of the report's whole — a badge and a meter in the tile's tone. */
    share?: number | null;
    /** One line for the tile's foot when it has no split: a key with {n} (hours, shown as days / hours) and/or {at} ("Y-m-d H:i"), plus plain numbers by name (`values` — {met}, {n}). */
    note?: { label_key: string; hours?: number | null; at?: string | null; values?: Record<string, number> } | null;
    /** Percent tiles: the goal the value is measured against — a meter with the goal marked. */
    goal?: number | null;
    /** Frames the tile apart from its colour once the value is above zero: amber = needs watching, red = gone wrong. */
    attention?: 'amber' | 'red' | null;
}

/** A chart colour, drawn by tabular-charts.tsx. */
export type ChartTone =
    | 'green'
    | 'blue'
    | 'violet'
    | 'orange'
    | 'amber'
    | 'red'
    | 'pink'
    | 'gray'
    // The Ticket & SLA overview (app.css --chart-soft-blue / --chart-pair-*): its blue, and the department
    // card's complementary pairs — blue ↔ orange, green ↔ rose — plus violet.
    | 'soft-blue'
    // The same meanings as the base tones, one step lighter (Tailwind 400) — the reports moved to the
    // overview's soft look (assets by status and department, backlog, SLA of tickets from requests).
    | 'soft-green'
    | 'soft-red'
    | 'soft-amber'
    | 'soft-orange'
    | 'soft-violet'
    | 'soft-pink'
    // Asset statuses, in the colours chosen in Settings → Assets (softened for reports, app.css).
    | 'asset-deployed'
    | 'asset-ready'
    | 'asset-pending-acceptance'
    | 'asset-common'
    | 'asset-pending-return'
    | 'asset-writeoff'
    | 'pair-orange'
    | 'pair-green'
    | 'pair-rose'
    | 'pair-violet';

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
          /** Ways to split each row's bar (e.g. by status, by source); the first shows first. */
          views: { key: string; label_key: string; series: ChartSeries[] }[];
          /** `apart`: not one of the grouped things (assets in no department) — listed last, on its own scale. */
          rows: { label: ChartLabel; values: Record<string, number>; total: number; apart?: boolean }[];
      }
    | {
          type: 'donut';
          key: string;
          title_key: string;
          center: { value: number | null; label_key: string };
          total: number;
          segments: (ChartSeries & { value: number })[];
      }
    | {
          // Rows as the /assets overview card draws its categories: icon, a count per group, a split bar.
          type: 'buckets';
          key: string;
          title_key: string;
          series: ChartSeries[];
          /** `icon`: a Lucide icon name from Master Data, or null. */
          rows: { label: ChartLabel; icon: string | null; values: Record<string, number>; total: number }[];
      }
    | {
          // How many sit in each place, one bar each in `tone`, then each place's share by `series`
          // (ready stock by warehouse, bought / rented) — two sections of one card.
          type: 'places';
          key: string;
          title_key: string;
          /** Said after the title in a lighter weight ("สถานะพร้อมใช้งาน"), if anything. */
          subtitle_key: string | null;
          tone: ChartTone;
          total: number;
          split_title_key: string;
          series: ChartSeries[];
          /** The series whose share each place's ring writes in its hole (rented). */
          center_key: string;
          /** The i18n key the heading counts the places with ("{n} คลัง"), after the asset count. */
          count_key: string;
          /** `apart`: no place recorded — listed last. */
          rows: { label: ChartLabel; values: Record<string, number>; total: number; apart?: boolean }[];
      }
    | {
          // A few records by name (the written-off assets), each opening on /assets.
          type: 'list';
          key: string;
          title_key: string;
          total: number;
          rows: { id: number; code: string; label: ChartLabel | null; model: string | null; place: string | null; reason: string | null }[];
      };

/** One live ticket on the backlog page's due board (TicketBacklogReport::board). */
export interface BacklogBoardTicket {
    id: number;
    ticket_no: string;
    subject: string;
    category: string | null;
    priority: string | null;
    status: string | null;
    assignee_id: number | null;
    assignee: string | null;
    department: { name: string | null; name_th: string | null } | null;
    /** "YYYY-MM-DD HH:mm" — the deadline it runs against now. */
    due_at: string | null;
    due_kind: 'response' | 'resolve' | null;
    /** Negative = already past the deadline. */
    hours_left: number | null;
}

/** Counts and averages over a set of tickets opened from requests (TicketRequestSlaReport::tally). */
export interface RequestSlaTally {
    total: number;
    completed: number;
    canceled: number;
    open: number;
    take_met: number;
    take_total: number;
    close_met: number;
    close_total: number;
    take_avg_hours: number | null;
    fix_avg_hours: number | null;
    over_now: number;
}

/** What the "สรุปผล SLA ของ Ticket จากคำขอ" page draws above its rows (TicketRequestSlaReport::breakdown). */
export interface RequestSlaBreakdown {
    /** One line per request type with a ticket, busiest first. */
    types: Array<RequestSlaTally & { type: string }>;
    overall: RequestSlaTally;
    /** Request types with no ticket in the range. */
    empty_types: string[];
    /** Live tickets already past their SLA, most overdue first. */
    open: {
        id: number;
        ticket_no: string;
        request_type: string | null;
        due_kind: 'response' | 'resolve';
        due_at: string | null;
        over_hours: number | null;
    }[];
    rules: {
        goal: number;
        response_minutes: number;
        /** Each request type's resolution target — null hours = none set (its priority's target applies). */
        resolve: { type: string; hours: number | null; clock: 'business' | 'calendar' | null }[];
    };
}

export interface TabularRows {
    data: Array<Record<string, unknown> & { id: number }>;
    meta: PagedRows<unknown>['meta'];
    summary: SummaryItem[];
    charts: TabularChart[];
}
