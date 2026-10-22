// Push on this device: which state the browser is in, when the bell invites, who is resubscribed on load, and whether push reaches this tab.
// Pure (no imports) so node tests can load it.

export type PushState = 'on' | 'off' | 'blocked' | 'needs_home_screen' | 'unsupported';

/** "ไว้ทีหลัง" hides the bell's invite for 14 days on this browser. */
export const SNOOZE_MS = 14 * 86_400_000;

export interface PushEnv {
    hasPushManager: boolean;
    isIos: boolean;
    standalone: boolean;
    permission: NotificationPermission;
    subscribed: boolean;
}

export function pushState(env: PushEnv): PushState {
    if (env.isIos && !env.standalone) return 'needs_home_screen';
    if (!env.hasPushManager) return 'unsupported';
    if (env.permission === 'denied') return 'blocked';
    if (env.permission === 'granted' && env.subscribed) return 'on';

    return 'off';
}

/** wantedByThisUser is this person's stored answer on this browser: '1' turned on, '0' turned off on purpose, null never answered. */
export function showInvite(
    state: PushState,
    permission: NotificationPermission,
    snoozedUntil: number | null,
    now: number,
    wantedByThisUser: '1' | '0' | null,
): boolean {
    const snoozed = snoozedUntil !== null && now < snoozedUntil;
    if (snoozed || wantedByThisUser === '0') return false;
    if (state === 'needs_home_screen') return true;

    return state === 'off' && (permission === 'default' || permission === 'granted');
}

export type PushSyncStep = 'subscribe' | 'confirm' | 'none';

/** On each load: subscribe again, re-send the subscription this person already holds so the server keeps it, or leave it. */
export function pushSyncStep(wantedByThisUser: boolean, permission: NotificationPermission, subscribed: boolean): PushSyncStep {
    if (!wantedByThisUser || permission !== 'granted') return 'none';

    return subscribed ? 'confirm' : 'subscribe';
}

/** Push reaches this person here only once the server confirmed this browser's subscription in this session. */
export function pushDeliversHere(wantedByThisUser: '1' | '0' | null, permission: NotificationPermission, serverConfirmed: boolean): boolean {
    return wantedByThisUser === '1' && permission === 'granted' && serverConfirmed;
}

/** iPhone and iPad; iPadOS Safari reports a Mac user agent, told apart by its touch points. */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
    if (/iPhone|iPad|iPod/.test(userAgent)) return true;

    return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}
