import { http } from './http';

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
    list: (): Promise<NotificationsResponse> =>
        http.get<NotificationsResponse>('/notifications').then((r) => r.data),

    markRead: (id: string): Promise<void> =>
        http.put(`/notifications/${id}/read`).then(() => undefined),

    markAllRead: (): Promise<void> =>
        http.put('/notifications/read-all').then(() => undefined),

    dismiss: (id: string): Promise<void> =>
        http.delete(`/notifications/${id}`).then(() => undefined),
};
