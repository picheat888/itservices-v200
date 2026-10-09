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
    requester_code: string | null;
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
    format: 'count' | 'money' | 'percent' | 'hours' | 'years';
    /** Optional breakdown for the tile's footer ("ซื้อ 62 · เช่า 18"). */
    /** `counts`: a count even on an hours tile (how many accepted same day, next day…). */
    split?: { key: string; label_key: string; tone: ChartTone; value: number; counts?: boolean }[];
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
        trend?: { direction: 'up' | 'down' | 'even'; label_key: string; values?: Record<string, number>; points?: number[] };
    } | null;
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
                  purpose: string | null;
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

export interface TabularRows {
    data: Array<Record<string, unknown> & { id: number }>;
    meta: PagedRows<unknown>['meta'];
    summary: SummaryItem[];
    charts: TabularChart[];
}
