// Reads failed API calls for the app-wide handlers: which failures are worth retrying, which error screen outranks another,
// and which server failures a form already showed inline. No imports, so node tests load it as is.

interface FailureShape {
    code?: string;
    config?: { method?: string; quietServerError?: boolean };
    response?: { status?: number; headers?: Record<string, unknown> };
}

export type AppErrorKind = 'server' | 'network' | 'rate-limit' | 'maintenance';

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

/** A query asks again only when another try can answer differently: a 5xx or a dropped connection, at most twice. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
    return failureCount < 2 && (isServerFailure(error) || isNetworkFailure(error));
}

export function isQuietServerError(error: unknown): boolean {
    return !!(error as FailureShape | null)?.config?.quietServerError;
}

export function isReadRequest(error: unknown): boolean {
    return ((error as FailureShape | null)?.config?.method ?? 'get').toLowerCase() === 'get';
}

const RANK: Record<AppErrorKind, number> = { 'rate-limit': 1, network: 2, server: 3, maintenance: 4 };

/** A later error replaces the one on screen only when it is more serious, so the first 5xx keeps its reference. */
export function outranks(next: AppErrorKind, current: AppErrorKind | null): boolean {
    return current === null || RANK[next] > RANK[current];
}

const shownInline = new WeakSet<object>();

/** A form put this failure in its own error banner, so no toast repeats it. */
export function markShownInline(error: unknown): void {
    if (error && typeof error === 'object') shownInline.add(error);
}

export function wasShownInline(error: unknown): boolean {
    return !!error && typeof error === 'object' && shownInline.has(error);
}
