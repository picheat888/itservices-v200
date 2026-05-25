import { http } from './http';

export interface NotificationData {
    type: string;
    subtype: 'credentials_required' | 'offboarding';
    employee_id: number;
    employee_name: string;
    employee_code: string;
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
