// Idle-warning maths: when it opens, the ring colour, the clock text, the screen-reader milestones and the clock tabs share.

/** The warning never opens more than this many seconds before sign-out. */
export const WARN_CAP_SEC = 120;

/** Seconds left at which a screen reader is told the time again. */
export const ANNOUNCE_AT = [60, 30, 10] as const;

export type WarnTone = 'ok' | 'warn' | 'danger';

/** Half the timeout, capped at two minutes; 0 when no timeout is set. */
export function warnSecondsFor(timeoutMinutes: number): number {
    if (timeoutMinutes <= 0) return 0;
    return Math.min(WARN_CAP_SEC, Math.floor(timeoutMinutes * 60 * 0.5));
}

/** Green for the first half of the warning, amber for the next quarter, red for the last. */
export function toneFor(secondsLeft: number, warnSeconds: number): WarnTone {
    const share = warnSeconds > 0 ? secondsLeft / warnSeconds : 0;
    if (share > 0.5) return 'ok';
    if (share > 0.25) return 'warn';
    return 'danger';
}

export function clock(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function spokenTime(seconds: number, words: { minutes: (n: number) => string; seconds: (n: number) => string }): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m && s) return `${words.minutes(m)} ${words.seconds(s)}`;
    return m ? words.minutes(m) : words.seconds(s);
}

/** The lowest milestone passed between two readings of the countdown, or null. */
export function crossedAnnouncement(previous: number, current: number): number | null {
    const passed = ANNOUNCE_AT.filter((m) => previous > m && current <= m);
    return passed.length ? Math.min(...passed) : null;
}

// Shared idle clock: every tab of one browser shares one session cookie, so they keep one activity time

/** A tab writes its activity for the others at most this often. */
export const ACTIVITY_SHARE_MS = 5_000;

export type SessionMessage = { type: 'activity'; at: number } | { type: 'logout' };

/** The later of this tab's activity and one read from another tab (localStorage text or a message). */
export function newerActivity(current: number, incoming: unknown): number {
    const at = typeof incoming === 'string' ? Number(incoming) : incoming;
    return typeof at === 'number' && Number.isFinite(at) && at > current ? at : current;
}

export function shouldShareActivity(now: number, lastShared: number): boolean {
    return now - lastShared >= ACTIVITY_SHARE_MS;
}

/** Activity anywhere after the warning opened means the person is still here. */
export function dismissesWarning(warningOpenedAt: number, activityAt: number): boolean {
    return activityAt > warningOpenedAt;
}

export function parseSessionMessage(data: unknown): SessionMessage | null {
    if (typeof data !== 'object' || data === null) return null;
    const message = data as { type?: unknown; at?: unknown };
    if (message.type === 'logout') return { type: 'logout' };
    if (message.type === 'activity' && typeof message.at === 'number' && Number.isFinite(message.at)) {
        return { type: 'activity', at: message.at };
    }
    return null;
}

// Heartbeat: the server only sees requests, so real activity is pinged to it

/** A third of the timeout, at most a minute: a one-minute timeout is pinged every 20 s. */
export function heartbeatMsFor(timeoutMinutes: number): number {
    return Math.min(60_000, (timeoutMinutes * 60_000) / 3);
}

/** 0 to ping now, else how long until the last ping is a heartbeat old. */
export function pingDelay(now: number, lastPing: number, heartbeatMs: number): number {
    return Math.max(0, lastPing + heartbeatMs - now);
}
