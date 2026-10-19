// Reads failed API calls for the app-wide handlers: which failures are worth retrying, which error screen outranks another,
// and which server failures a form already showed inline. No imports, so node tests load it as is.

interface FailureShape {
    code?: string;
    config?: { method?: string; quietServerError?: boolean };
    response?: { status?: number; headers?: Record<string, unknown>; data?: { message?: unknown } };
}

export type AppErrorKind = 'server' | 'network' | 'rate-limit' | 'busy' | 'maintenance';

export function httpStatus(error: unknown): number | undefined {
    return (error as FailureShape | null)?.response?.status;
}

export function requestIdOf(error: unknown): string | null {
    const id = (error as FailureShape | null)?.response?.headers?.['x-request-id'];
    return typeof id === 'string' && id !== '' ? id : null;
}

/** Seconds from a Retry-After header, or null when it is missing or not a positive number. */
export function retryAfterOf(error: unknown): number | null {
    const seconds = Number((error as FailureShape | null)?.response?.headers?.['retry-after']);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

export function isServerFailure(error: unknown): boolean {
    const status = httpStatus(error);
    return status !== undefined && status >= 500;
}

/** Lost in transit (no response at all), not cancelled by the app. */
export function isNetworkFailure(error: unknown): boolean {
    const failure = error as FailureShape | null;
    return !!failure && typeof failure === 'object' && 'config' in failure && !failure.response && failure.code !== 'ERR_CANCELED';
}

/** A query asks again only when another try can answer differently: a 5xx (not a 503, which asks to wait) or a dropped connection, at most twice. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
    return failureCount < 2 && ((isServerFailure(error) && httpStatus(error) !== 503) || isNetworkFailure(error));
}

/** A 503 is a full or unreachable database when the server says server_busy (App\Support\DatabaseBusy), else maintenance. */
export function serviceUnavailableKind(error: unknown): 'busy' | 'maintenance' {
    return (error as FailureShape | null)?.response?.data?.message === 'server_busy' ? 'busy' : 'maintenance';
}

export function isQuietServerError(error: unknown): boolean {
    return !!(error as FailureShape | null)?.config?.quietServerError;
}

/** The sign-in form and its device-limit dialog word their own throttle wait, so a 429 there raises no full-screen error. */
export function showsOwnThrottle(url: string | undefined): boolean {
    return !!url && (url.endsWith('/login') || url.includes('/login/devices/'));
}

export function isReadRequest(error: unknown): boolean {
    return ((error as FailureShape | null)?.config?.method ?? 'get').toLowerCase() === 'get';
}

const RANK: Record<AppErrorKind, number> = { 'rate-limit': 1, network: 2, server: 3, busy: 4, maintenance: 5 };

/** A later error replaces the one on screen only when it is more serious, so the first 5xx keeps its reference. */
export function outranks(next: AppErrorKind, current: AppErrorKind | null): boolean {
    return current === null || RANK[next] > RANK[current];
}

/** A server error the reader closed stays quiet on that same page; every other kind, and any other page, follows `outranks`. */
export function shouldShowAppError(next: AppErrorKind, current: AppErrorKind | null, quietPath: string | null, path: string): boolean {
    if (next === 'server' && quietPath === path) return false;
    return outranks(next, current);
}

/** Moving to another page re-arms the server dialog; staying on the quiet page keeps it quiet. */
export function quietPathAfterMove(quietPath: string | null, path: string): string | null {
    return quietPath === path ? quietPath : null;
}

const shownInline = new WeakSet<object>();

/** A form put this failure in its own error banner, so no toast repeats it. */
export function markShownInline(error: unknown): void {
    if (error && typeof error === 'object') shownInline.add(error);
}

export function wasShownInline(error: unknown): boolean {
    return !!error && typeof error === 'object' && shownInline.has(error);
}
