// Words for a failed sign-in: lockout, busy sign-ins, wrong credentials, closed account, expired confirmation, outage, no connection.
// Pure (no React), so node tests load it as is.

type Translate = (key: string) => string;
type FormatNumber = (n: number) => string;

interface FailureShape {
    response?: { status?: number; data?: { retry_after?: unknown; message?: unknown } | null; headers?: Record<string, unknown> };
}

/** A wait in words: "1 minute", "15 minutes", "1 second", "45 seconds" (minutes rounded up from 60 seconds on). */
export function waitWords(seconds: number, t: Translate, fmtN: FormatNumber): string {
    if (seconds >= 60) {
        const minutes = Math.ceil(seconds / 60);
        return minutes === 1 ? t('session_one_minute') : t('login_time_minutes').replace('{n}', fmtN(minutes));
    }
    return seconds === 1 ? t('session_one_second') : t('login_time_seconds').replace('{n}', fmtN(seconds));
}

/** The banner text for a failed sign-in or a failed device sign-out. */
export function loginErrorText(error: unknown, t: Translate, fmtN: FormatNumber): string {
    const res = (error as FailureShape | null)?.response;
    // No answer at all: the connection, not the server
    if (!res) return t('login_err_server');

    const data = res.data ?? {};
    if (res.status === 429) {
        // The account lockout says too_many_attempts; too_many_sign_ins is a busy IP or dialog, nobody's wrong password
        const busy = data.message === 'too_many_sign_ins';
        const header = Number(res.headers?.['retry-after']);
        const seconds = typeof data.retry_after === 'number' ? data.retry_after : Number.isFinite(header) ? header : 0;
        if (seconds <= 0) return t(busy ? 'login_err_busy_wait' : 'login_err_throttled_wait');
        return t(busy ? 'login_err_busy' : 'login_err_throttled').replace('{time}', waitWords(seconds, t, fmtN));
    }
    if (res.status === 403 && data.message === 'account_closed') return t('login_err_closed');
    if (res.status === 403 && data.message === 'pending_expired') return t('login_pending_expired');
    if (res.status === 422) return t('login_error');
    if (res.status === 419) return t('login_err_reload');
    if (res.status === 503) return t('err_maintenance_later');

    return t('err_server_body');
}
