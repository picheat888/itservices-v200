// Barrel for the notifications module — re-exports everything that the rest of the app consumes.

// Hooks
export { useDismissNotification, useMarkAllRead, useMarkRead, useNotifications } from './hooks/use-notifications';

// API
export { notificationApi } from './api/notificationApi';
export type { AppNotification, NotificationData, NotificationsResponse } from './api/notificationApi';
