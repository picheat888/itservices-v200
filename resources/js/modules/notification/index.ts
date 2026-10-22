// Barrel for the notifications module — re-exports everything that the rest of the app consumes.
//
// The module has two halves, and they share one api file and one hooks file: the TRAY (the
// alerts a person has received) and the CONFIGURATION (what each alert says, and whether it
// fires at all). They are the same subject seen from two sides, and they share a cache —
// rewording a notification has to invalidate the wording every open tray is holding.

// Hooks — tray
export {
    useDismissNotification,
    useFetchNotificationsSince,
    useMarkAllRead,
    useMarkRead,
    useNotificationFeed,
    useNotifications,
} from './hooks/use-notifications';

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

// A bell's text and click target (pure; also built into the service worker).
export { moduleOf, notificationMessage, notificationTarget, notificationTitle, type Translate } from './lib/notification-text';

// When the page rings and sums up missed bells, and the bell sound itself.
export { AWAY_MS, catchUpSince, claimRing, enteredBellIds, shouldRingInPage, summaryLines } from './lib/arrival-rules';
export {
    DEFAULT_SOUND,
    SOUND_KEYS,
    isSoundKey,
    playNotificationSound,
    soundName,
    unlockSoundOnFirstGesture,
    type SoundKey,
} from './lib/sound-player';

// The groups a notification belongs to — shared by the tray's tabs and the Settings chips.
export { NOTIFICATION_GROUPS, notificationGroupLabel } from './groups';

// The Notification tab of Email & Notifications.
export { NotificationSettingsPane, NotificationSettingsStats } from './components/notification-settings-pane';
