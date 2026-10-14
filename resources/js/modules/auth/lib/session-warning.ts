// Idle-warning maths: when it opens, the ring colour, the clock text and the screen-reader milestones.

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
