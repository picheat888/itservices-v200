// Push on this device: which state the browser is in, when the bell invites, and who is resubscribed on sign-in.
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

export function showInvite(state: PushState, permission: NotificationPermission, snoozedUntil: number | null, now: number): boolean {
    const snoozed = snoozedUntil !== null && now < snoozedUntil;
    if (snoozed) return false;
    if (state === 'needs_home_screen') return true;

    return state === 'off' && permission === 'default';
}

export function shouldAutoResubscribe(wantedByThisUser: boolean, permission: NotificationPermission, subscribed: boolean): boolean {
    return wantedByThisUser && permission === 'granted' && !subscribed;
}

/** iPhone and iPad; iPadOS Safari reports a Mac user agent, told apart by its touch points. */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
    if (/iPhone|iPad|iPod/.test(userAgent)) return true;

    return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}
