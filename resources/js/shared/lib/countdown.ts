// Countdown maths shared by the idle warning and the error dialogs: clock text, seconds left, ring fill.

export function clock(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Whole seconds until endsAt, rounded up, never below zero. */
export function secondsLeft(endsAt: number, now: number): number {
    return Math.max(0, Math.ceil((endsAt - now) / 1_000));
}

/** 0 when all the time is left, 1 when none is; 1 when there is no total. */
export function elapsedShare(left: number, total: number): number {
    return total > 0 ? Math.max(0, Math.min(1, (total - left) / total)) : 1;
}

type Translate = (key: string) => string;
type FormatNumber = (n: number) => string;

/** A wait in words: "1 minute", "15 minutes", "1 second", "45 seconds" (minutes rounded up from 60 seconds on). */
export function waitWords(seconds: number, t: Translate, fmtN: FormatNumber): string {
    if (seconds >= 60) {
        const minutes = Math.ceil(seconds / 60);
        return minutes === 1 ? t('session_one_minute') : t('login_time_minutes').replace('{n}', fmtN(minutes));
    }
    return seconds === 1 ? t('session_one_second') : t('login_time_seconds').replace('{n}', fmtN(seconds));
}

/** What a screen reader hears when an error dialog opens with a wait: "You can try again in 45 seconds." */
export function waitSpoken(seconds: number, t: Translate, fmtN: FormatNumber): string {
    return t('err_wait_spoken').replace('{time}', waitWords(seconds, t, fmtN));
}

/** The maintenance line: about N minutes (rounded up), a single minute in words, or "later" without a Retry-After. */
export function maintenanceLine(retryAfter: number | null, t: Translate, fmtN: FormatNumber): string {
    if (retryAfter === null) return t('err_maintenance_later');
    const minutes = Math.ceil(retryAfter / 60);
    return minutes <= 1 ? t('err_maintenance_body_one') : t('err_maintenance_body').replace('{n}', fmtN(minutes));
}
