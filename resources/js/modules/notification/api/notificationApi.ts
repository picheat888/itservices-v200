import { http } from '@/shared/lib/http';

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
    // Asset assigned notifications (asset_assigned)
    asset_id?: number;
    asset_tag?: string;
    asset_model?: string;
    asset_nickname?: string | null;
    from?: string | null;
    // Service request notifications (request) — subtype: submitted | waiting |
    // ready_to_fulfill | approved_step | approved_final | rejected | fulfilled | cancelled
    // (ready_to_fulfill carries ticket_no when the workflow opened its own case)
    service_request_id?: number;
    title?: string;
    request_type?: string;
    /** 'onboarding' when the request was filed for a new employee (see ServiceRequestOrigin). */
    origin?: string;
    step_label?: string | null;
    actor_name?: string | null;
    remark?: string | null;
}

export interface AppNotification {
    id: string;
    data: NotificationData;
    read: boolean;
    created_at: string;
}

export interface NotificationsResponse {
    data: AppNotification[];
    unread: number;
}

export const notificationApi = {
    list: (): Promise<NotificationsResponse> => http.get<NotificationsResponse>('/notifications').then((r) => r.data),

    markRead: (id: string): Promise<void> => http.put(`/notifications/${id}/read`).then(() => undefined),

    markAllRead: (): Promise<void> => http.put('/notifications/read-all').then(() => undefined),

    dismiss: (id: string): Promise<void> => http.delete(`/notifications/${id}`).then(() => undefined),
};
