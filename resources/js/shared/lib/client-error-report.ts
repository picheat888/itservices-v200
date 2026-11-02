// Sends browser errors to POST /api/client-errors (logs/frontend) and reloads once when a stale build's files are gone.
import { APP_BUILT_AT } from '@/shared/lib/app-build';
import { isPageLoadWaiting, reloadForNewBuild } from '@/shared/lib/chunk-reload';
import { createReportCache } from '@/shared/lib/report-cache';
import axios, { isAxiosError } from 'axios';

export type ClientErrorKind = 'error' | 'rejection' | 'render' | 'chunk';

const MAX_REPORTS_PER_PAGE = 10;
const IGNORED = [/ResizeObserver loop/i];

const reportOnce = createReportCache(MAX_REPORTS_PER_PAGE);
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

export function reportClientError(
    kind: ClientErrorKind,
    error: unknown,
    extra?: { source?: string | null; stack?: string | null },
): Promise<string | null> {
    // API failures are already in the backend log under their request id
    if (isAxiosError(error)) return Promise.resolve(null);

    const message = (error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? 'Unknown error')).slice(0, 1000);
    if (IGNORED.some((pattern) => pattern.test(message))) return Promise.resolve(null);

    const stack = withoutOrigin([error instanceof Error ? error.stack : null, extra?.stack].filter(Boolean).join('\n')).slice(0, 5000);
    const source = extra?.source ? withoutOrigin(extra.source) : sourceOf(stack);

    const key = `${kind}|${message}|${source ?? ''}`;

    return reportOnce(key, async () => {
        const response = await reporter.post('/client-errors', {
            kind,
            message,
            stack: stack || null,
            source: source?.slice(0, 300) ?? null,
            url: `${window.location.pathname}${window.location.search}`.slice(0, 500),
            request_id: lastRequestId,
            build: APP_BUILT_AT,
        });
        const id: unknown = response.headers['x-request-id'];
        return typeof id === 'string' && id !== '' ? id : null;
    });
}

export function installClientErrorReporting(): void {
    if (installed) return;
    installed = true;

    window.addEventListener('error', (event) => {
        const source = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : null;
        void reportClientError('error', event.error ?? event.message, { source });
    });

    window.addEventListener('unhandledrejection', (event) => {
        void reportClientError('rejection', event.reason);
    });

    window.addEventListener('vite:preloadError', (event) => {
        void reportClientError('chunk', (event as Event & { payload?: unknown }).payload ?? 'Failed to load a build file');
        // Only a page being opened reloads; otherwise the load fails and its error shows (a failed preload stays quiet)
        if (isPageLoadWaiting() && reloadForNewBuild()) event.preventDefault();
    });
}
