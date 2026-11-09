// Barrel for the notifications module: the tray (alerts received), their configuration (wording, on/off)
// and push on this device. Tray and configuration share one api file, one hooks file and one cache.

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
export { AWAY_MS, catchUpSince, claimRing, enteredBellIds, heldRoundRing, shouldRingInPage, summaryLines } from './lib/arrival-rules';
export {
    DEFAULT_SOUND,
    SOUND_KEYS,
    isSoundKey,
    playNotificationSound,
    soundName,
    unlockSoundOnFirstGesture,
    type SoundKey,
} from './lib/sound-player';

// Push on this device: the rules, the browser client, the service worker bridge and the two places a person turns it on.
export { DeviceNotificationSettings } from './components/device-notification-settings';
export { PushInviteRow } from './components/push-invite-row';
export { usePushState, useServiceWorkerBridge } from './hooks/use-push';
export { currentPushState, disablePush, enablePush, pushAnswer, pushDeliveredHere, resubscribeIfWanted, sendTestPush } from './lib/push-client';
export { pushOpenTarget, type PushOpenTarget } from './lib/push-open';
export { SNOOZE_MS, pushDeliversHere, pushState, pushSyncStep, showInvite, type PushState } from './lib/push-rules';

// The groups a notification belongs to — shared by the tray's tabs and the Settings chips.
export { NOTIFICATION_GROUPS, notificationGroupLabel } from './lib/groups';

// The Notification tab of Email & Notifications.
export { NotificationSettingsPane, NotificationSettingsStats } from './components/notification-settings-pane';
