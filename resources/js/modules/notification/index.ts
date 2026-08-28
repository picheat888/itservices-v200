// Barrel for the notifications module — re-exports everything that the rest of the app consumes.
//
// The module has two halves, and they share one api file and one hooks file: the TRAY (the
// alerts a person has received) and the CONFIGURATION (what each alert says, and whether it
// fires at all). They are the same subject seen from two sides, and they share a cache —
// rewording a notification has to invalidate the wording every open tray is holding.

// Hooks — tray
export { useDismissNotification, useMarkAllRead, useMarkRead, useNotifications } from './hooks/use-notifications';

// Hooks — notification configuration
export { useNotificationMessages, useNotificationTemplateMutations, useNotificationTemplates, useNotificationText } from './hooks/use-notifications';

// API
export { notificationApi, notificationTemplateApi } from './api/notificationApi';
export type {
    AppNotification,
    NotificationData,
    NotificationMessages,
    NotificationTemplate,
    NotificationTemplatePayload,
    NotificationTypeCount,
    NotificationsResponse,
} from './api/notificationApi';

// The Notification tab of Email & Notifications.
export { NotificationSettingsPane, NotificationSettingsStats } from './components/notification-settings-pane';
