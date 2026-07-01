// Barrel for the notifications module — re-exports everything that the rest of the app consumes.

// Hooks
export { useNotifications, useMarkRead, useMarkAllRead, useDismissNotification } from './hooks/use-notifications';

// API
export { notificationApi } from './api/notificationApi';
export type { NotificationData, AppNotification, NotificationsResponse } from './api/notificationApi';
