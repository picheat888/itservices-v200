import { ensureCsrf, http } from '@/shared/lib/http';

export interface NotificationData {
    type: string;
    subtype?: string;
    // Employee notifications
    employee_id?: number;
    employee_name?: string;
    employee_code?: string;
    // Contract expiry notifications
    contract_id?: number;
    contract_code?: string;
    contract_vendor?: string;
    contract_name?: string;
    days_remaining?: number;
    // Stock alert notifications (stock_alert)
    stock_item_id?: number;
    sku?: string;
    name?: string;
    qty?: number;
    // Stock request notifications (stock_request)
    stock_request_id?: number;
    reference?: string;
    // Stock count notifications (stock_count)
    stock_count_id?: number;
    // Ticket SLA alerts (ticket_sla) — subtype: response_at_risk | response_breached | resolve_at_risk | resolve_breached
    ticket_id?: number;
    ticket_no?: string;
    subject?: string;
    // Ticket owner notifications (ticket_owner) — event: taken | forwarded | resolved | cancelled
    event?: string;
    by?: string | null;
    // Asset bells (asset_assigned, asset_return_requested, asset_recalled — the last one's
    // subtype says whether a hand-over was cancelled or a held device was taken back)
    asset_id?: number;
    asset_tag?: string;
    asset_model?: string;
    asset_nickname?: string | null;
    from?: string | null;
    // Service request notifications (request) — subtype: submitted | waiting | stalled |
    // ready_to_fulfill | approved_step | approved_final | rejected | fulfilled | cancelled
    // (ready_to_fulfill carries ticket_no when the workflow opened its own case)
    service_request_id?: number;
    title?: string;
    request_type?: string;
    /** 'onboarding' when the request was filed for a new employee (see ServiceRequestOrigin). */
    origin?: string;
    step_label?: string | null;
    /** Who the request is for — the bell writes an on-behalf headline the way the list does. */
    requester_name?: string | null;
    actor_name?: string | null;
    remark?: string | null;
    /** Only on `stalled`: whole days the step has been waiting. */
    stalled_days?: number | null;
    // Access left behind by a departed employee (access_offboarding). Split as well as
    // totalled: a grant to revoke and a resource needing a new owner are different jobs.
    // A sample sent from the Notification tab: which notification it imitates, and the module
    // it should be tabbed under.
    source_key?: string;
    module?: string;
    /** asset_offboarding: how many devices the leaver still had in hand. */
    count?: number;
    grants?: number;
    owned?: number;
    total?: number;
}

export interface AppNotification {
    id: string;
    data: NotificationData;
    read: boolean;
    /** Human-readable ("5 hours ago") — what the tray prints. */
    created_at: string;
    /** The same instant, machine-readable, for deciding what actually arrived just now. */
    created_at_iso?: string;
}

/**
 * How many notifications exist of one payload type — the raw tally the tray's filter chips
 * are built from. `module` is only set on a test sample, which is tabbed under the module it
 * imitates rather than under a module of its own.
 */
export interface NotificationTypeCount {
    type: string | null;
    module: string | null;
    count: number;
}

export interface NotificationsResponse {
    /** The most recent rows only — the list is capped server-side. */
    data: AppNotification[];
    unread: number;
    /** Every notification held, not just the ones in `data`. */
    total: number;
    /** Real totals per payload type, so the chips do not count the window they were handed. */
    counts: NotificationTypeCount[];
}

export const notificationApi = {
    list: (): Promise<NotificationsResponse> => http.get<NotificationsResponse>('/notifications').then((r) => r.data),

    markRead: (id: string): Promise<void> => http.put(`/notifications/${id}/read`).then(() => undefined),

    markAllRead: (): Promise<void> => http.put('/notifications/read-all').then(() => undefined),

    dismiss: (id: string): Promise<void> => http.delete(`/notifications/${id}`).then(() => undefined),
};

/* ------------------------------------------------------------------------------------
 * Bell CONFIGURATION — what each alert says and whether it fires.
 *
 * Lives beside the tray API rather than in its own file because both are the same
 * subject seen from two sides: the rows above are the alerts a person received, these
 * are the definitions those alerts are rendered from. One module, one api file.
 * ---------------------------------------------------------------------------------- */

/**
 * One configurable in-app bell, as the settings page sees it: the catalogue's description
 * joined to the wording an administrator can change.
 */
export interface NotificationTemplate {
    key: string;
    module: string;
    // No name / trigger / audience here: those are UI text and live in the SPA's own
    // dictionary (notification_name_* / notification_when_* / notification_who_*), keyed off `key`.
    message_en: string;
    message_th: string;
    enabled: boolean;
    last_sent_at: string | null;
    /** False once the wording has been changed from the standard. */
    is_standard: boolean;
    /**
     * True when the same event also sends an email. A bell WITHOUT one is the only channel
     * its event has, so switching it off means nobody hears about that event at all.
     */
    has_email: boolean;
}

export interface NotificationTemplateStats {
    total: number;
    enabled: number;
    edited: number;
    only_channel: number;
}

export interface NotificationTemplatesResponse {
    data: NotificationTemplate[];
    stats: NotificationTemplateStats;
}

export interface NotificationTemplatePayload {
    message_en: string;
    message_th: string;
    enabled: boolean;
}

/** The wording alone, keyed by message key — what the tray needs to render itself. */
export type NotificationMessages = Record<string, { en: string; th: string }>;

async function mutate<T>(method: 'put' | 'post', url: string, payload?: unknown): Promise<T> {
    await ensureCsrf();
    const res = await http.request<T>({ method, url, data: payload });

    return res.data;
}

export const notificationTemplateApi = {
    // Admin config; gated by system.configure_notifications.
    list: () => http.get<NotificationTemplatesResponse>('/notification-templates').then((r) => r.data),
    update: (key: string, payload: NotificationTemplatePayload) => mutate<{ message: string }>('put', `/notification-templates/${key}`, payload),
    reset: (key: string) => mutate<{ message: string }>('post', `/notification-templates/${key}/reset`),
    // Sends a sample of one notification to the signed-in user's own tray.
    test: (key: string) => mutate<{ message: string }>('post', `/notification-templates/${key}/test`),
    // Wording only, for every signed-in user — rendering your own tray needs no admin rights.
    messages: () => http.get<{ data: NotificationMessages }>('/notification-messages').then((r) => r.data.data),
};
