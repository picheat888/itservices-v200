// Shapes of the monitor TV API (GET /monitor/board, pairing) and Settings → จอ Monitor status.

export type MonitorGroup = 'overdue' | 'near' | 'waiting';

export interface MonitorPerson {
    id: number;
    name: string;
    initials: string;
}

export interface MonitorRow {
    id: number;
    ticket_no: string;
    subject: string;
    priority: 'critical' | 'high' | 'medium' | 'low' | null;
    department: string | null;
    requester: string | null;
    group: MonitorGroup;
    clock: 'response' | 'resolve';
    due_at: string;
    created_at: string;
    assignee: MonitorPerson | null;
}

export interface MonitorKpis {
    waiting: number;
    waiting_oldest_at: string | null;
    in_progress: number;
    busy_staff: number;
    overdue: number;
    overdue_response: number;
    overdue_resolve: number;
    near_due: number;
    closed_today: number;
    closed_today_met: number;
}

export interface MonitorMember extends MonitorPerson {
    count: number;
}

export interface MonitorBoard {
    generated_at: string;
    sound: { key: string; enabled: boolean };
    kpis: MonitorKpis;
    rows: MonitorRow[];
    team: MonitorMember[];
}

export interface MonitorPairingCode {
    pairing_id: string;
    code: string;
    expires_at: string;
    expires_in: number;
}

export type MonitorPairingState = { status: 'pending' | 'expired' } | { status: 'paired'; device_token: string };

export interface MonitorDeviceStatus {
    paired: boolean;
    paired_at: string | null;
    paired_by: string | null;
    browser: string | null;
    os: string | null;
    last_seen_at: string | null;
}
