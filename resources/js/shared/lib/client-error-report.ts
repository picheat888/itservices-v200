// Sends browser errors to POST /api/client-errors (logs/frontend) and reloads once when a stale build's files are gone.
import axios, { isAxiosError } from 'axios';

export type ClientErrorKind = 'error' | 'rejection' | 'render' | 'chunk';

const MAX_REPORTS_PER_PAGE = 10;
const CHUNK_RELOAD_KEY = 'itsd-chunk-reload';
const IGNORED = [/ResizeObserver loop/i];

const sent = new Set<string>();
let lastRequestId: string | null = null;
let installed = false;

// Own axios instance: a failed report must never trigger the app's error screen or toasts
const reporter = axios.create({
    baseURL: '/api',
    withCredentials: true,
    withXSRFToken: true,
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
});

/** The X-Request-Id of the latest failed API call, sent along so both logs can be matched. */
export function rememberRequestId(requestId: string | null | undefined): void {
    if (requestId) lastRequestId = requestId;
}

function withoutOrigin(text: string): string {
    return text.split(window.location.origin).join('');
}

function sourceOf(stack: string): string | null {
    const match = stack.match(/(https?:\/\/[^\s)]+|\/[^\s)]+):(\d+):(\d+)/);
    return match ? withoutOrigin(`${match[1]}:${match[2]}:${match[3]}`) : null;
}

export function reportClientError(kind: ClientErrorKind, error: unknown, extra?: { source?: string | null; stack?: string | null }): void {
    // API failures are already in the backend log under their request id
    if (isAxiosError(error)) return;

    const message = (error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? 'Unknown error')).slice(0, 1000);
    if (IGNORED.some((pattern) => pattern.test(message))) return;

    const stack = withoutOrigin([error instanceof Error ? error.stack : null, extra?.stack].filter(Boolean).join('\n')).slice(0, 5000);
    const source = extra?.source ? withoutOrigin(extra.source) : sourceOf(stack);

    const key = `${kind}|${message}|${source ?? ''}`;
    if (sent.has(key) || sent.size >= MAX_REPORTS_PER_PAGE) return;
    sent.add(key);

    void reporter
        .post('/client-errors', {
            kind,
            message,
            stack: stack || null,
            source: source?.slice(0, 300) ?? null,
            url: `${window.location.pathname}${window.location.search}`.slice(0, 500),
            request_id: lastRequestId,
        })
        .catch(() => undefined);
}

/** A deploy replaced the build: reload once to fetch the new files (guarded so it can't loop). */
function reloadForNewBuild(): void {
    try {
        const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
        if (Date.now() - last < 60_000) return;
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    } catch {
        return;
    }
    window.location.reload();
}

export function installClientErrorReporting(): void {
    if (installed) return;
    installed = true;

    window.addEventListener('error', (event) => {
        const source = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : null;
        reportClientError('error', event.error ?? event.message, { source });
    });

    window.addEventListener('unhandledrejection', (event) => {
        reportClientError('rejection', event.reason);
    });

    window.addEventListener('vite:preloadError', (event) => {
        event.preventDefault();
        reportClientError('chunk', (event as Event & { payload?: unknown }).payload ?? 'Failed to load a build file');
        reloadForNewBuild();
    });
}
