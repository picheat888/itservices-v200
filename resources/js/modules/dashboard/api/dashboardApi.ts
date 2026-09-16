import { http } from '@/shared/lib/http';

/** One asset handed to the reader that they have not accepted yet. */
export interface PendingAsset {
    id: number;
    asset_code: string;
    tag: string | null;
    model: string | null;
}

export interface MyTicketRow {
    id: number;
    ticket_no: string;
    subject: string;
    status: string;
    assignee_name: string | null;
}

export interface MyRequestRow {
    id: number;
    reference: string;
    title: string;
    status: string;
}

export interface MyAssetRow {
    id: number;
    asset_code: string;
    tag: string | null;
    model: string | null;
    category: string | null;
    status: string;
}

/** The reader's own half of the front page. Blocks for IT and HR land beside it later. */
export interface DashboardMine {
    kpi: { open_tickets: number; pending_requests: number; assets: number; resolved_this_month: number };
    pending_acceptance: PendingAsset[];
    tickets: MyTicketRow[];
    requests: MyRequestRow[];
    assets: MyAssetRow[];
}

/** One person's share of the case queue. `assignee_id` null is the unassigned pile. */
export interface WorkloadRow {
    assignee_id: number | null;
    name: string | null;
    open: number;
    closed: number;
}

/** One day of the volume chart: what arrived, and what was still open when the day ended. */
export interface VolumeDay {
    date: string;
    opened: number;
    backlog: number;
}

export interface DashboardIt {
    window_days: number;
    volume_days: number;
    volume: VolumeDay[];
    by_status: { open: number; in_progress: number; completed: number; canceled: number };
    workload: WorkloadRow[];
}

export interface RecentHire {
    id: number;
    name: string;
    position: string | null;
    department: string | null;
    joined_at: string | null;
}

export interface DepartmentHeadcount {
    id: number;
    name: string;
    name_th: string | null;
    count: number;
}

export interface DashboardHr {
    kpi: { headcount: number; new_this_month: number; pending_onboarding: number; resigned_this_month: number };
    recent_hires: RecentHire[];
    headcount_by_department: DepartmentHeadcount[];
}

export interface ActivityRow {
    id: number;
    actor: string | null;
    action: string;
    target: string | null;
    at: string | null;
}

/**
 * Blocks the reader may not see are absent, not empty — the page draws what arrived, so
 * "you have no permission" and "there is nothing here" never look the same.
 */
export interface DashboardSummary {
    mine: DashboardMine;
    it?: DashboardIt;
    hr?: DashboardHr;
    activity?: ActivityRow[];
}

export const dashboardApi = {
    summary: (): Promise<DashboardSummary> => http.get<{ data: DashboardSummary }>('/dashboard/summary').then((r) => r.data.data),
};
