// Types and the call for the front page's one summary endpoint (GET /api/dashboard/summary).
import { http } from '@/shared/lib/http';

/** One asset handed to the reader that they have not accepted yet. */
export interface PendingAsset {
    id: number;
    asset_code: string;
    tag: string | null;
    model: string | null;
    category: string | null;
    category_th: string | null;
}

export interface MyTicketRow {
    id: number;
    ticket_no: string;
    subject: string;
    status: string;
    assignee_name: string | null;
    assignee_name_th?: string | null;
}

export interface MyRequestRow {
    id: number;
    reference: string;
    title: string;
    status: string;
}

export type AccessType = 'email_group' | 'file_share' | 'social_platform' | 'software';

export interface DashboardMine {
    kpi: {
        open_tickets: number;
        open_split: { open: number; in_progress: number };
        requests_unfinished: number;
        requests_split: { pending: number; approved: number };
        assets: number;
        assets_pending: number;
        access_total: number;
        access_by_type: Record<AccessType, number>;
        closed_this_month: number;
    };
    todo: {
        my_jobs: { total: number; over_sla: number; due_soon: number; on_track: number } | null;
        approvals: { count: number; oldest_days: number } | null;
        pending_acceptance: PendingAsset[];
    };
    tickets: MyTicketRow[];
    tickets_total: number;
    requests: MyRequestRow[];
    requests_total: number;
}

export interface DailyCount {
    date: string;
    count: number;
}

/** A 14-day figure: the sum, the busiest day, and one point per day (today last). */
export interface SeriesFigure {
    total: number;
    peak: number;
    series: number[];
}

/** One person's in-progress cases. */
export interface WorkloadRow {
    assignee_id: number;
    name: string | null;
    open: number;
}

export interface DashboardIt {
    waiting: { count: number; oldest_days: number };
    backlog: { open: number; in_progress: number; over_sla: number; delta_14d: number; series: number[] };
    opened: SeriesFigure;
    closed: SeriesFigure;
    /** from/to: the 30-day window the rate and the average cover. */
    sla: { rate: number | null; measured: number; goal: number; from: string; to: string };
    avg_resolve_hours: number | null;
    volume: DailyCount[];
    unassigned: number;
    workload: WorkloadRow[];
}

/** A request step that has sat with somebody past the stalled threshold. */
export interface WaitingRequestRow {
    id: number;
    reference: string;
    title: string;
    waiting_on: string | null;
    days: number;
}

export interface DashboardRequests {
    awaiting_it: { count: number; le7: number; d8_14: number; gt14: number };
    filed: SeriesFigure;
    pending: { count: number; oldest_days: number };
    filed_30d: number;
    completed_30d: number;
    rejected_30d: number;
    cancelled_30d: number;
    avg_days_to_complete: number | null;
    waiting_after_days: number;
    waiting_total: number;
    waiting: WaitingRequestRow[];
    by_type: { type: string; count: number }[];
}

export interface DashboardContracts {
    expiring: { total: number; d30: number; d31_plus: number; overdue: number };
}

export interface DepartmentCount {
    id: number;
    name: string;
    name_th: string | null;
    count: number;
}

export interface DashboardHr {
    by_department: DepartmentCount[];
    no_department: number;
    headcount: number;
}

export interface ActivityRow {
    id: number;
    actor: string | null;
    action: string;
    target: string | null;
    at: string | null;
}

export interface DashboardActivity {
    items: ActivityRow[];
    today_count: number;
}

/** Blocks the reader may not see are absent, not empty. */
export interface DashboardSummary {
    mine: DashboardMine;
    it?: DashboardIt;
    requests?: DashboardRequests;
    contracts?: DashboardContracts;
    hr?: DashboardHr;
    activity?: DashboardActivity;
}

export const dashboardApi = {
    summary: (): Promise<DashboardSummary> => http.get<{ data: DashboardSummary }>('/dashboard/summary').then((r) => r.data.data),
};
