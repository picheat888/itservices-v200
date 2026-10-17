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
    weekly: { week_start: string; opened: number; closed: number; backlog: number | null }[];
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
    requester_code: string | null;
    department_name: string | null;
    department_name_th: string | null;
    category: string | null;
    priority: string | null;
    status: string;
    /** tickets.source — 'manual' | 'auto_request' */
    source: string | null;
    assignee_name: string | null;
    assignee_name_th?: string | null;
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
    /** A second line under the option in the picker (a contract's name under its code). */
    hint?: string | null;
}

export interface TabularFilterDef {
    name: string;
    type: 'select' | 'date' | 'search';
    options: FilterOption[];
    default: string | number | null;
    label_key: string;
    /** Only sets how the page is shown (ReportFilter::viewOnly) — never listed, counted or cleared as a filter. */
    view?: boolean;
}

export type ColumnType = 'text' | 'localized' | 'number' | 'money' | 'date' | 'datetime' | 'days_left' | 'hours_left' | 'enum';

export interface TabularColumnDef {
    key: string;
    type: ColumnType;
    label_key: string;
    /** enum columns only: raw value → i18n key. */
    labels?: Record<string, string>;
    /** Starts hidden in the column picker (ReportColumn::hiddenByDefault) until the reader shows it. */
    hidden?: boolean;
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
    /** 'count' (default, plain integer) | 'money' (2 decimals, locale grouping) | 'percent' (whole %) | 'hours' / 'years' (one decimal). */
    format: 'count' | 'money' | 'percent' | 'hours' | 'years' | 'days';
    /** Optional breakdown for the tile's footer ("ซื้อ 62 · เช่า 18"). */
    /** `counts`: a count even on an hours tile (how many accepted same day, next day…). */
    split?: { key: string; label_key: string; tone: ChartTone; value: number; counts?: boolean; short_key?: string }[];
    /** The value as a percent of the report's whole — a badge and a meter in the tile's tone. */
    share?: number | null;
    /** One line for the tile's foot when it has no split: a key with {n} (hours, shown as days / hours) and/or {at} ("Y-m-d H:i"), plus plain numbers by name (`values` — {met}, {n}). */
    note?: {
        label_key: string;
        hours?: number | null;
        at?: string | null;
        values?: Record<string, number>;
        /** Words by name — plain, or a master-data name the page shows in the reader's language. */
        texts?: Record<string, string | { name: string; name_th: string | null }>;
        /** A change drawn after the note (▲ green, ▼ red, grey for none), with a small line through `points` when given. */
        trend?: {
            direction: 'up' | 'down' | 'even';
            label_key: string;
            values?: Record<string, number>;
            points?: (number | null)[];
            /** The request reports' trend (RequestLabels::trend): drawn as the snapshot strip's Delta + Sparkline, coloured by whether up is good (null = neither). */
            up_is_good?: boolean | null;
            /** Places after the point for the change (the turnover's 2.3 points). */
            decimals?: number;
        };
    } | null;
    /** Percent tiles: the goal the value is measured against — a meter with the goal marked. */
    goal?: number | null;
    /** Frames the tile apart from its colour once the value is above zero: amber = needs watching, red = gone wrong. */
    attention?: 'amber' | 'red' | null;
    /** A small chart beside the value, in place of the split bar. */
    chart?: SummaryChart | null;
    /** A bar filled to this percent in the tile's tone, without a badge (done of total). */
    progress?: number | null;
}

export type SummaryChart =
    | { kind: 'line'; points: number[]; months: string[]; tone?: 'good' | 'bad' }
    | { kind: 'columns'; items: { key: string; label_key: string; short: string; tone: ChartTone; value: number }[] };

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
    | 'pair-violet'
    // The Access module's registry colours (access-overview.tsx CHANNEL).
    | 'access-email'
    | 'access-file'
    | 'access-social'
    | 'access-software';

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
          /** `at`: when it was written off ("Y-m-d H:i"). */
          rows: {
              id: number;
              code: string;
              label: ChartLabel | null;
              model: string | null;
              place: string | null;
              reason: string | null;
              at: string | null;
          }[];
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

/** What the "สรุปผล SLA ของ Ticket ที่ผู้ใช้เปิดเอง" page draws above its rows (TicketManualSlaReport::breakdown). */
export interface ManualSlaBreakdown {
    /** The dimension the groups split by. */
    by: 'category' | 'priority' | 'work_class' | 'assignee';
    /** One line per group; `key` is the dimension's value ('none' = not set), `label` names an assignee. */
    groups: Array<RequestSlaTally & { key: string; label: string | null }>;
    overall: RequestSlaTally;
    /** Live tickets already past their SLA, most overdue first. */
    open: {
        id: number;
        ticket_no: string;
        category: string | null;
        assignee: string | null;
        due_kind: 'response' | 'resolve';
        due_at: string | null;
        over_hours: number | null;
    }[];
    /** How late the late closes were (calendar hours past the resolve deadline). */
    late: { total: number; bands: { key: string; n: number }[]; median_hours: number | null; near: number };
    rules: {
        goal: number;
        response_minutes: number;
        /** Each priority's resolution target. */
        resolve: { priority: string; hours: number; clock: 'business' | 'calendar' }[];
        /** How many repair (work class) targets are set — 0 = repairs use their priority's target. */
        repair_rules: number;
        hours: { days: number[]; start: string; end: string; break_start: string | null; break_end: string | null };
    };
}

/** What the "การตัดจำหน่ายทรัพย์สิน" page draws above its rows (AssetWriteoffReport::breakdown). */
export interface AssetWriteoffBreakdown {
    /** Every month of the range, oldest first, empty months included. */
    months: { month: string; total: number; bought: number; returned: number; rented_other: number }[];
    /** Most first; key "returned" = handed back to the lessor, "none" = no reason picked. */
    reasons: { key: string; reason_id: number | null; name: string | null; total: number; bought: number; rented: number }[];
    /** Most first; a null id/name = no category. */
    categories: {
        category_id: number | null;
        name: string | null;
        name_th: string | null;
        total: number;
        bought: number;
        rented: number;
        bought_value: number;
        avg_age_years: number | null;
        age_bands: { under_3: number; from_3_to_5: number; over_5: number };
        under_warranty: number;
    }[];
    /** The category table's totals row, over every asset (null when there are none). */
    category_totals: {
        total: number;
        bought: number;
        rented: number;
        bought_value: number;
        avg_age_years: number | null;
        age_bands: { under_3: number; from_3_to_5: number; over_5: number };
        under_warranty: number;
    } | null;
    /** Every contract with assets, all-time (only the contract filter narrows it), most urgent first. */
    contracts: {
        id: number;
        code: string;
        name: string | null;
        vendor: string | null;
        vendor_th: string | null;
        end_date: string | null;
        units: number;
        returned: number;
        written_off_other: number;
        still_out: number;
        days_left: number | null;
        returned_early: number;
        flag: 'overdue' | 'ending_soon' | 'running' | 'all_returned';
    }[];
}

/** The Access registries, by their morph alias. */
export type AccessType = 'email_group' | 'file_share' | 'social_platform' | 'software';

/** A department in two languages, as master data comes. */
export type AccessDepartment = { name: string; name_th: string | null } | null;

/** A person on the access cards; `days` since the last day once they have left. */
export interface AccessPerson {
    employee_id: number;
    code: string;
    name: string;
    department: AccessDepartment;
    last_day: string | null;
    days: number | null;
}

/** A resource on the access cards: its address (email, path, URL or brand) and, for email groups and file shares, its department. */
export interface AccessResource {
    type: AccessType;
    id: number;
    code: string | null;
    name: string | null;
    detail: string | null;
    department: AccessDepartment;
    owner?: AccessPerson | null;
}

/** What the "ภาพรวมสิทธิ์การเข้าถึง" page draws above its rows (AccessOverviewReport::breakdown). */
export interface AccessOverviewBreakdown {
    /** Active grants per registry whatever the type filter — the type segments' counts. */
    types: Record<AccessType, number>;
    /** The register's active / revoked / all segments. */
    states: { active: number; revoked: number; all: number };
    /** Every month of the range, oldest first: grants by type, revocations while working / on leaving. */
    months: { month: string; granted: number; revoked_work: number; revoked_leave: number; by_type: Record<AccessType, number> }[];
    leavers: {
        /** Longest gone first. */
        people: (AccessPerson & { grants: { type: AccessType; id: number; code: string | null; name: string | null }[] })[];
        /** Email groups and file shares a leaver still owns. */
        owned: (AccessResource & { owner: AccessPerson })[];
        resigned: number;
    };
    /** Most grants first; a null id = no department. */
    departments: {
        department_id: number | null;
        name: string | null;
        name_th: string | null;
        staff: number;
        holders: number;
        grants: number;
        by_type: Record<AccessType, number>;
        leavers: number;
    }[];
    care: { owner_gone: AccessResource[]; no_owner: AccessResource[]; empty: AccessResource[] };
}

/** Where a member sits next to the resource: its department, another, gone (has left), or it has no department. */
export type AccessMemberKind = 'in_dept' | 'cross' | 'gone' | 'open';

/** "ตรวจสอบสมาชิกและเจ้าของ": one resource with its owner and members. */
export interface AccessMembersResource extends AccessResource {
    owner: AccessPerson | null;
    /** An email group or file share with no owner, or whose owner has left. */
    owner_issue: 'none' | 'gone' | null;
    members: number;
    mix: Record<AccessMemberKind, number>;
    read: number;
    write: number;
    /** A file share's size as typed; 0 = unlimited. */
    size: { value: number; unit: string | null } | null;
}

/** What the "ตรวจสอบสมาชิกและเจ้าของ" page draws above its rows (AccessResourceMembersReport::breakdown). */
export interface AccessMembersBreakdown {
    /** Resources per registry whatever the type filter. */
    types: Record<string, number>;
    /** The list's active / cross-department / revoked segments. */
    states: { active: number; cross: number; revoked: number };
    /** Most to do first. */
    resources: AccessMembersResource[];
    /** The picked resource's review sheet: every active member by name. */
    sheet:
        | (AccessMembersResource & {
              list: (AccessPerson & {
                  level: 'Read' | 'Write' | 'member';
                  granted_at: string | null;
                  kind: AccessMemberKind;
              })[];
          })
        | null;
}

/** "การใช้ License ซอฟต์แวร์": a software's seats; `seats` null = not seat-limited. */
export interface SoftwareSeats {
    id: number;
    code: string | null;
    name: string;
    brand: string | null;
    license_type: string | null;
    seats: number | null;
    used: number;
    /** Seats leavers still hold. */
    gone: number;
    left: number | null;
    usage: 'full' | 'available' | 'unlimited' | 'over';
    pct: number | null;
    /** Software requests still pending or approved. */
    requests: number;
    /** Full with requests waiting: IT cannot grant until a seat is bought or taken back. */
    blocked: boolean;
}

/** What the "การใช้ License ซอฟต์แวร์" page draws above its rows (SoftwareLicenseReport::breakdown). */
export interface SoftwareLicenseBreakdown {
    usage: { all: number; full: number; available: number; unlimited: number; over: number };
    states: { active: number; revoked: number };
    /** Most to do first. */
    softwares: SoftwareSeats[];
    /** Longest gone first. */
    leavers: (AccessPerson & { grants: { id: number; code: string | null; name: string | null; requests: number; blocked: boolean }[] })[];
    /** Oldest first. */
    requests: {
        id: number;
        reference: string | null;
        status: 'pending' | 'approved';
        created_at: string | null;
        days: number;
        software: { id: number; code: string | null; name: string | null };
        requester: { name: string; code: string | null; department: AccessDepartment };
        seats_left: number | null;
        gone: number;
    }[];
    /** The picked software's name. */
    picked: string | null;
}

/** What the "ประวัติโอนย้ายและรับคืน" page draws above its rows (AssetTransferHistoryReport::breakdown). */
/** "ประกันใกล้หมดอายุ": a category or vendor row of the period tables. */
export interface WarrantyGroupFigures {
    total: number;
    /** One place each: expired, in the window, window to a year (0 for a year-long window), beyond a year. */
    periods: { expired: number; within: number; mid: number; later: number };
    within_year: number;
    /** The asset due soonest inside the window. */
    nearest: { id: number; code: string; days_left: number } | null;
    more_in_window: number;
    more_same_day: number;
    /** Days to the next asset due at all (expired ones aside). */
    next_days: number | null;
}

export type WarrantyStatus = 'ready' | 'deployed' | 'common' | 'pending_acceptance' | 'pending_return';

/** GET /reports/contracts/overview/breakdown — ContractOverviewReport::breakdown(). */
export interface ContractOverviewBreakdown {
    tiles: {
        active: number;
        in_reminder: number;
        monthly: number;
        yearly: number;
        /** Bills due from the 1st of this month to the end of the 12th month, every open contract. */
        next_12: number;
        next_12_bills: number;
        /** Scheduled bills left until each open contract's end date. */
        remaining: number;
        /** End date (YYYY-MM-DD) of the open contract with bills left that runs longest. */
        longest_end: string | null;
        top_vendor: { vendor_id: number | null; name: string | null; name_th: string | null; yearly: number; share: number } | null;
    };
    /** This month and the next 11, each with its bills (ContractMonthCard). */
    months: {
        month: string;
        items: {
            id: number;
            code: string;
            name: string;
            type: import('./components/contract-tones').ContractTypeKey;
            amount: number;
            date: string;
            yearly: number;
        }[];
    }[];
    biggest_bill: { id: number; code: string; name: string; amount: number; date: string } | null;
    /** Every type, biggest yearly cost first (live contracts). */
    types: { type: import('./components/contract-tones').ContractTypeKey; contracts: number; yearly: number }[];
    cycles: { cycle: 'monthly' | 'quarterly' | 'yearly'; contracts: number; yearly: number }[];
    yearly_total: number;
    /** Live contracts by vendor, biggest yearly cost first; no vendor last. */
    vendors: {
        vendor_id: number | null;
        name: string | null;
        name_th: string | null;
        contracts: number;
        monthly: number;
        yearly: number;
        remaining: number;
        /** Live contracts ending within 90 days. */
        ending_soon: number;
    }[];
}

/** GET /reports/contracts/renewals/breakdown — ContractRenewalsReport::breakdown(). */
export interface ContractRenewalsBreakdown {
    /** The "หมดภายใน" window in days. */
    within: number;
    tiles: {
        within: { count: number; yearly: number };
        soon: { count: number; nearest: { id: number; code: string; days: number } | null };
        /** `days` is how long past its end the oldest one is. */
        overdue: { count: number; oldest: { id: number; code: string; days: number } | null };
        files: { missing: number; open: number };
        closed_year: { count: number; cancelled: number; expired: number };
    };
    /** This month and the next 11: open contracts by the month they end (ContractMonthCard). */
    months: {
        month: string;
        items: {
            id: number;
            code: string;
            name: string;
            type: 'software' | 'hardware' | 'service' | 'connectivity' | 'other';
            amount: number;
            date: string;
            yearly: number;
        }[];
    }[];
    open_total: number;
    bands: {
        key: ContractRenewalBand;
        total: number;
        yearly: number;
        types: Record<'software' | 'hardware' | 'service' | 'connectivity' | 'other', number>;
    }[];
    /** The list's reminder and to-do cells, one per contract inside the window. */
    list: ContractRenewalListItem[];
    closed: {
        range: ContractClosedRange;
        cancelled: number;
        expired: number;
        unpaid: number;
        rows: ContractClosedRow[];
    };
}

export type ContractRenewalBand = 'overdue' | 'd30' | 'd90' | 'd180' | 'd365' | 'later';

export type ContractClosedRange = 'year' | '12m' | 'all';

export interface ContractRenewalListItem {
    id: number;
    in_reminder: boolean;
    alert: {
        /** Thresholds switched on, largest first. */
        days: number[];
        /** Thresholds already mailed (0 = the "ended" mail), largest first. */
        sent: number[];
        sent_at: string | null;
        state: 'off' | 'sent' | 'missed' | 'waiting';
        starts_in: number | null;
    };
    todo: {
        main: 'overdue' | 'today' | 'return_rent' | 'decide_ma' | 'contact' | 'not_yet';
        rented: number;
        bought: number;
        held: number;
    };
}

export interface ContractClosedRow {
    id: number;
    code: string;
    name: string;
    vendor: { name: string; name_th: string | null } | null;
    type: string;
    kind: 'cancelled' | 'expired';
    closed_at: string;
    end_date: string;
    /** Days from the end date to the day it closed: negative = closed before its end. */
    gap: number;
    /** Bills after the cancel date up to the end date × value; 0 for an ended contract. */
    unpaid: number;
    reason: string | null;
    by: string | null;
}

/** Where a hardware contract's linked assets came from: any rented unit makes it a rental. */
export type ContractRentalKind = 'rent' | 'buy' | 'none';

/** A contract's state as the /contracts list words it, with "reminder" for an active one inside its reminder window. */
export type ContractRentalState = 'active' | 'reminder' | 'due_today' | 'overdue' | 'cancelled' | 'expired';

export type RentalAssetStatus = WarrantyStatus | 'writeoff';

/** GET /reports/contracts/rentals/breakdown — ContractRentalsReport::breakdown(). */
export interface ContractRentalsBreakdown {
    scope: 'open' | 'all';
    tiles: {
        contracts: { total: number; rent: number; buy: number; none: number };
        /** Rented units not written off, on contracts not yet past their end. */
        rented_in_use: number;
        avg_per_unit: number | null;
        due_soon: number;
        due_soon_held: number;
        due_soon_ready: number;
        ended_out: number;
        ended_out_contracts: number;
        unlinked: number;
        unlinked_yearly: number;
    };
    /** Linked contracts (needing action first), then the unlinked ones. */
    contracts: {
        id: number;
        code: string;
        name: string;
        vendor: ChartLabel | null;
        kind: ContractRentalKind;
        units: number;
        statuses: Record<RentalAssetStatus, number>;
        per_unit: number | null;
        yearly: number;
        end_date: string;
        days_left: number;
        state: ContractRentalState;
        due_soon: number;
        ended_out: number;
        rank: number;
    }[];
    /** Models rented on running contracts, most extra over buying first. */
    models: {
        model_id: number | null;
        name: string | null;
        brand: string | null;
        category: ChartLabel;
        contracts: number;
        units: number;
        per_unit: number;
        term_months: number;
        rent_total: number;
        avg_buy: number | null;
        bought: number;
        break_even_months: number | null;
        over_buy: number | null;
    }[];
}

export interface AssetWarrantyBreakdown {
    /** The "ภายใน" window in days. */
    within: number;
    /** This month and the next 11, by where each asset due is now. */
    months: { month: string; total: number; statuses: Record<WarrantyStatus, number> }[];
    bands: { key: 'expired' | 'd30' | 'd90' | 'd180' | 'd365' | 'later'; total: number; statuses: Record<WarrantyStatus, number> }[];
    /** Most due in the window first; a null id = no category. */
    categories: (WarrantyGroupFigures & { category_id: number | null; name: string | null; name_th: string | null })[];
    category_totals: WarrantyGroupFigures | null;
    /** Most due in the window first; a null id = no vendor, always last. */
    vendors: (WarrantyGroupFigures & { vendor_id: number | null; name: string | null; name_th: string | null })[];
}

export interface AssetTransferBreakdown {
    /** Every month of the range, oldest first, empty months included. */
    months: { month: string; handover: number; return: number; recall: number; relocate: number }[];
    /** What became of the hand-overs in the range (TransferTrail::acceptance). */
    acceptance: {
        to_people: number;
        to_shared: number;
        same_day: number;
        next_day: number;
        later: number;
        /** Of the later ones: sent on a Friday, accepted the Monday after. */
        later_weekend: number;
        waiting: number;
        recalled: number;
        never_accepted: number;
        median_hours: number | null;
        within_2_days: number;
    };
    /** Warehouses on the trail, most hand-overs out first. */
    warehouses: { name: string; out: number; back: number }[];
    /** Hand-overs to employees by the receiver's department, most first; null = no department. */
    departments: { department_id: number | null; name: string | null; name_th: string | null; count: number }[];
    /** Hand-overs by the asset's category, most first; null = no category. */
    categories: { name: string | null; name_th: string | null; count: number }[];
    /** Assets waiting right now (not by the date range): pending acceptance first, longest wait first. */
    waiting: {
        id: number;
        code: string;
        brand: string | null;
        model: string | null;
        category: ChartLabel | null;
        status: 'pending_acceptance' | 'pending_return';
        holder: { code: string; name: string; department: ChartLabel | null } | null;
        owner_label: string | null;
        /** "Y-m-d H:i" */
        since: string;
        cause: 'handover' | 'request' | 'resign' | null;
        days: number;
    }[];
    /** Location updates in the range, newest first (the holder stays the same). */
    relocations: {
        id: number;
        asset_id: number;
        /** "Y-m-d H:i" */
        at: string;
        code: string;
        brand: string | null;
        model: string;
        from: string | null;
        to: string;
        reason: string | null;
        by: string | null;
    }[];
}

/** A request type value (App\Enums\Request\RequestType). */
export type RequestTypeKey = import('@/shared/types').ServiceRequestType;

/** A request status value (App\Enums\Request\RequestStatus). */
export type RequestStatusKey = 'pending' | 'approved' | 'completed' | 'rejected' | 'cancelled';

/** The ticket category a request type opens (RequestType::ticketCategory). */
export type RequestCategoryKey = 'hardware' | 'software' | 'network' | 'cctv' | 'telephone' | 'other';

/** Median whole days of completed requests: submitted → approved, approved → completed, submitted → completed. */
export interface RequestDelivery {
    count: number;
    approval: number | null;
    it: number | null;
    total: number | null;
}

/** What the "ภาพรวมคำขอ" page draws above its rows (RequestOverviewReport::breakdown). */
export interface RequestOverviewBreakdown {
    /** Every month of the range: submitted in it, and completed in it whatever the submit date. */
    months: { month: string; submitted: number; completed: number }[];
    /** Most requests first; `approved` = got through approval (approved_at set), `rejected` = turned down. */
    types: { type: RequestTypeKey; total: number; by_status: Record<RequestStatusKey, number>; approved: number; rejected: number }[];
    /** Slowest type first, and the same over every type. */
    delivery: { types: (RequestDelivery & { type: RequestTypeKey })[]; all: RequestDelivery };
    items: {
        /** Requests by origin, for the segment counts. */
        origins: { all: number; direct: number; onboarding: number };
        /** New employees HR filed requests for. */
        people: number;
        /** Requests that picked an item, by origin. */
        picked: { all: number; direct: number; onboarding: number };
        /** One entry per origin and item, most asked for first. */
        list: {
            origin: 'direct' | 'onboarding';
            type: RequestTypeKey;
            kind: 'option' | 'software' | 'file_share' | 'email_group' | 'social_platform';
            id: number;
            name: string;
            name_th: string | null;
            count: number;
        }[];
    };
    /** By the requester's department, most first; department_id null = none (or only the written name). */
    departments: {
        department_id: number | null;
        name: string | null;
        name_th: string | null;
        total: number;
        by_category: Record<RequestCategoryKey, number>;
        top_type: { type: RequestTypeKey; count: number; ties: number };
        onboarding: number;
    }[];
}

/** Age groups the request approvals and IT pages share (RequestLabels::ageBand). */
export type RequestAgeBand = 'over_7' | 'days_4_7' | 'upto_3';

/** What the "การอนุมัติคำขอ" page draws above its rows (RequestApprovalsReport::breakdown). */
export interface RequestApprovalsBreakdown {
    /** Waiting now, longest first, by what keeps it waiting. */
    stuck: Record<'left' | 'no_account' | 'over7' | 'upto7', RequestStuckStep[]>;
    approvers: {
        rows: RequestApproverRow[];
        total: RequestApproverStats & { approvers: number };
    };
    endings: {
        counts: { all: number; rejected: number; withdrawn: number; not_delivered: number };
        rows: RequestEnding[];
    };
    skips: RequestSkipReasonRow[];
}

export interface RequestStuckStep {
    request_id: number;
    reference: string;
    type: string;
    label: string;
    position: number;
    approver: { name: string; code: string | null; kind: 'person' | 'group_step' | 'unlinked_account' };
    /** "Y-m-d", the approver's last day when they have left. */
    approver_left_on: string | null;
    requester: string;
    became_current_at: string;
    days: number;
    age_band: RequestAgeBand;
}

export interface RequestApproverStats {
    steps: number;
    approved: number;
    rejected: number;
    waiting: number;
    avg_days: number | null;
    max_days: number | null;
    oldest_waiting_days: number | null;
    oldest_age_band: RequestAgeBand | null;
}

export interface RequestApproverRow extends RequestApproverStats {
    key: string;
    name: string;
    code: string | null;
    department: ChartLabel | null;
    kind: 'person' | 'group_step' | 'unlinked_account';
    /** A department step nobody took, or an account with no employee: set apart under the dashed rule. */
    apart: boolean;
    left: boolean;
    no_account: boolean;
}

export type RequestEndingOutcome = 'rejected' | 'withdrawn' | 'not_delivered';

export interface RequestEnding {
    request_id: number;
    reference: string;
    type: string;
    outcome: RequestEndingOutcome;
    /** The step the request stopped at; null for IT's closing step. */
    stop_label: string | null;
    stop_position: number | null;
    /** The rejecting approver, the canceller, or IT's closer; null when not recorded. */
    decided_by: string | null;
    /** The note or cancel reason; null when not recorded. */
    reason: string | null;
    at: string;
}

export interface RequestSkipReasonRow {
    reason: 'no_matching_position' | 'no_resource_owner' | 'no_manager' | 'no_department_approver' | 'requester_is_owner';
    steps: number;
    requests: number;
    labels: Record<string, number>;
    unapproved_requests: number;
    top_requesters: { name: string; count: number }[];
    ownerless_resources: { name: string; code: string | null }[];
    managerless_requesters: { name: string; code: string | null }[];
    resources: { name: string; code: string | null }[];
    departments: { department: ChartLabel | null; positions: string[] }[];
}

/** What the "คำขอที่รอ IT ส่งมอบ" page draws above its rows (ItPendingRequestReport::breakdown). */
export interface ItPendingBreakdown {
    waiting: {
        total: number;
        avg_days: number | null;
        /** Each age group with who has its requests (the bucket popovers). */
        bands: Record<RequestAgeBand, { total: number; unassigned: number; no_ticket: number; assigned: number }>;
    };
    /** Requests finished in the last 30 days (today included) and how long IT took from approval. */
    delivered: { from: string; to: string; total: number; avg_days: number | null; bands: Record<RequestAgeBand, number> };
    /** Named staff by most waiting, then 'none' and 'no_ticket' (always listed). */
    by_assignee: ItPendingGroup[];
    by_type: (Omit<ItPendingGroup, 'key' | 'name' | 'in_progress' | 'open'> & { type: string })[];
    joiners: ItPendingJoiners;
}

export interface ItPendingGroup {
    /** A user id, 'none' (ticket with nobody on it) or 'no_ticket'. */
    key: string;
    name: string | null;
    total: number;
    in_progress: number;
    open: number;
    bands: Record<RequestAgeBand, number>;
    oldest_days: number | null;
}

export interface ItPendingJoiners {
    from: string;
    to: string;
    counts: { on_time: number; late: number; open: number; past_start: number; before_start: number };
    /** The request types any listed joiner has, in the Request module's order: the table's columns. */
    types: string[];
    /** Urgency order: not ready past the start day, not ready before it, ready late, ready on time. */
    rows: ItPendingJoiner[];
    /** Resigned before starting with onboarding requests still open. */
    left_early: ItPendingJoiner[];
}

export interface ItPendingJoiner {
    employee_id: number;
    code: string;
    name: string;
    name_th: string | null;
    department: ChartLabel | null;
    joined_at: string;
    last_day: string | null;
    days_to_start: number;
    started: boolean;
    verdict: 'on_time' | 'late' | 'open' | null;
    late_days: number;
    open: number;
    pending: number;
    requests: {
        id: number;
        reference: string;
        type: string;
        status: 'pending' | 'approved' | 'completed' | 'rejected' | 'cancelled';
        completed_on: string | null;
        late_days: number;
        has_ticket: boolean;
        assignee: string | null;
        current_approver: string | null;
    }[];
}

/** One page of a tabular report's rows (asked for with only_rows, so without the numbers). */
export interface TabularRows {
    data: Array<Record<string, unknown> & { id: number }>;
    meta: PagedRows<unknown>['meta'];
}

/** A tabular report's headline numbers and charts for a filter set (/reports/tabular/{key}/summary). */
export interface TabularHeadline {
    summary: SummaryItem[];
    charts: TabularChart[];
}

/** Headcount figures of one department, section or the whole page (EmployeeOverviewReport::breakdown). */
export interface EmployeeOverviewCounts {
    start: number;
    joined: number;
    left: number;
    end: number;
}

/** A department or section row; `name` null = no department / section recorded. */
export interface EmployeeOverviewUnit extends EmployeeOverviewCounts {
    id: number | null;
    name: string | null;
    name_th: string | null;
}

/** What the "ภาพรวมพนักงาน" page draws above its list. */
export interface EmployeeOverviewBreakdown {
    from: string;
    to: string;
    /** The headcount day: the range end, or today while the end is still ahead. */
    as_of: string;
    headcount: { start: number; end: number };
    joiners: { started: number; upcoming: number };
    leavers: { count: number; rate: number | null; still_working: number; per_bucket: number[]; bucket_months: string[] };
    prep: { people: number; done: number; total: number; urgent: boolean; started: number; next_in_days: number | null };
    holding: {
        people: number;
        grants: number;
        by_type: Record<AccessType, number>;
        rows: {
            employee: { id: number; code: string; name: string; name_th: string | null };
            department: { name: string; name_th: string | null } | null;
            last_day: string | null;
            days_out: number | null;
            grants: { type: AccessType; name: string }[];
        }[];
    };
    bucket: 'month' | 'quarter' | 'year';
    /** One point per bucket at its end, today for the current one. */
    points: {
        start: string;
        end: string;
        headcount: number;
        /** Headcount the day before the bucket starts. */
        base: number;
        joined: number;
        left: number;
        current: boolean;
        events: {
            kind: 'joined' | 'left';
            id: number;
            code: string;
            name: string;
            name_th: string | null;
            date: string;
            /** A leaver whose last day is before their start day. */
            before_start: boolean;
        }[];
    }[];
    departments: (EmployeeOverviewUnit & { sections: EmployeeOverviewUnit[]; hidden_sections: number })[];
    empty_departments: { id: number; name: string; name_th: string | null }[];
    total: EmployeeOverviewCounts;
    can_open_access: boolean;
}

/** One person in an open-items card (EmployeeOpenItemsReport::breakdown). */
export interface OpenItemsPerson {
    id: number;
    code: string;
    name: string;
    name_th: string | null;
    department: { name: string; name_th: string | null } | null;
    section: { name: string; name_th: string | null } | null;
    position: string | null;
    last_day: string | null;
    /** Days since the last day; negative while it is still to come. */
    days_out: number | null;
    resigned: boolean;
}

export type OpenItemsGroup = 'asset' | 'access' | 'acct' | 'data';
export type OpenItemsAccountKind = 'left' | 'must_change' | 'expired';
export type DataIssueKey = 'mgr_left' | 'no_mgr' | 'no_email' | 'no_dept' | 'no_sec' | 'no_pos' | 'bad_dates';

/** What the "สรุปเรื่องค้างของพนักงาน" page draws. */
export interface EmployeeOpenItemsBreakdown {
    people_total: number;
    asset: {
        people: number;
        pieces: number;
        oldest_days: number | null;
        rows: (OpenItemsPerson & {
            assets: {
                id: number;
                code: string | null;
                category: { name: string; name_th: string | null } | null;
                model: string | null;
                status: string;
            }[];
        })[];
    };
    access: {
        people: number;
        grants: number;
        oldest_days: number | null;
        rows: (OpenItemsPerson & { grants: { type: AccessType; name: string }[] })[];
    };
    acct: {
        accounts: number;
        by_kind: Record<OpenItemsAccountKind, number>;
        expiry_days: number;
        rows: {
            user_id: number;
            username: string;
            kind: OpenItemsAccountKind;
            role: string | null;
            password_changed_at: string | null;
            employee: OpenItemsPerson | null;
        }[];
    };
    data: {
        people: number;
        by_issue: Record<DataIssueKey, number>;
        rows: (OpenItemsPerson & {
            issues: {
                key: DataIssueKey;
                manager?: { name: string | null; name_th: string | null; last_day: string | null };
                joined_at?: string | null;
                last_day?: string | null;
            }[];
        })[];
    };
}

/** One month of the stock in & out chart, every month of the chosen range. */
export interface StockFlowMonth {
    month: string;
    receive: number;
    return: number;
    issue: number;
    transfer: number;
    receive_value: number;
    issue_value: number;
    /** Adjust up − adjust down, in pieces. */
    adjust_net: number;
}

/** A stock request still waiting today: pending approval, or approved and not yet issued. */
export interface StockWaitingRequest {
    reference: string | null;
    item_name: string | null;
    sku: string | null;
    qty: number;
    unit: string | null;
    requester: string;
    requester_th: string | null;
    status: 'pending' | 'approved';
    created_at: string | null;
    /** Approval for an approved request, filing for a pending one. */
    waiting_since: string | null;
}

/** GET /reports/stock/movements/breakdown — StockMovementReport::breakdown(). */
export interface StockMovementsBreakdown {
    tiles: Record<import('@/shared/types').StockMovementType, { qty: number; value: number; times: number }>;
    /** 12 months ending with the range's end month. */
    months: StockFlowMonth[];
    /** As of today, oldest first. `rows` stop at 500, the counts do not. */
    requests: { pending: number; approved: number; rows: StockWaitingRequest[] };
    /** Fulfilled requests in the range per requester, unsorted. */
    people: {
        user_id: number | null;
        name: string;
        name_th: string | null;
        department_id: number | null;
        department: string | null;
        department_th: string | null;
        qty: number;
        value: number;
        times: number;
    }[];
    /** The same per department (department_id null = no department), unsorted. */
    departments: {
        department_id: number | null;
        name: string | null;
        name_th: string | null;
        people: number;
        qty: number;
        value: number;
        times: number;
    }[];
    /** Committed counts in the range, newest first; `lines` = lines that differ. */
    counts: {
        reference: string;
        warehouse: string | null;
        committed_at: string | null;
        lines: number;
        up: number;
        down: number;
        net_value: number;
    }[];
}

/** GET /reports/stock/valuation/breakdown — StockValuationReport::breakdown(). */
export interface StockValuationBreakdown {
    as_of: string;
    /** as_of is today: only then are warehouses known. */
    today: boolean;
    tiles: {
        value: number;
        qty: number;
        /** Items with stock at the day. */
        held: number;
        /** Every item in scope. */
        items: number;
        out: number;
        dead90: { value: number; count: number };
    };
    /** Held items by category, most valuable first. */
    categories: { category_id: number | null; name: string | null; name_th: string | null; items: number; qty: number; value: number }[];
    /** Today's balances by warehouse, most valuable first; null for a past day. */
    warehouses: { warehouse_id: number | null; name: string | null; items: number; qty: number; value: number }[] | null;
    /** Held items not moved for more than 90 days, most valuable first. */
    dead: {
        item_id: number;
        sku: string;
        name: string;
        category: string | null;
        category_th: string | null;
        unit: string | null;
        qty: number;
        value: number;
        last_move: string;
        days: number;
    }[];
}

/** GET /reports/stock/below-min/breakdown — StockBelowMinReport::breakdown(). */
export interface StockLevelsBreakdown {
    tiles: {
        items_total: number;
        out: number;
        low: number;
        over: number;
        /** Pieces short of Min over the low items. */
        low_gap: number;
        /** Pieces above Max over the over items. */
        over_excess: number;
        /** Out and low items, and what reordering them costs. */
        reorder: { value: number; items: number };
        excess_value: number;
    };
    /** Most items outside min/max first. */
    categories: { category_id: number | null; name: string | null; name_th: string | null; out: number; low: number; over: number }[];
}
