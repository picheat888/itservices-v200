import { ME_KEY, queryClient } from '@/shared/lib/query-client';
import { useAppErrorStore } from '@/stores/app-error';
import { useToastStore } from '@/stores/toast';
import axios from 'axios';

// Same-origin SPA: Laravel serves the app and the API, so cookies flow
// automatically. withCredentials + withXSRFToken let Sanctum's cookie-based
// SPA auth work (XSRF-TOKEN cookie -> X-XSRF-TOKEN header).
export const http = axios.create({
    baseURL: '/api',
    withCredentials: true,
    withXSRFToken: true,
    headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    },
});

// Server-side inactivity timeout (CheckSessionTimeout middleware) returns
// 401 with message "session_expired". Redirect to login so the user isn't
// left staring at a silently-failing screen. Other 401s (e.g. the initial
// unauthenticated /me probe) are left for callers to handle.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

http.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status as number | undefined;

        if (status === 401 && error.response.data?.message === 'session_expired' && !window.location.pathname.startsWith('/login')) {
            window.location.href = '/login?reason=session_expired';
            return Promise.reject(error);
        }

        // 419 = stale CSRF token — e.g. cookies clobbered by late responses racing a
        // logout (single-worker dev server), or a login page left open past the session
        // lifetime. Refresh the cookie and replay the request once — the standard
        // Sanctum SPA recovery.
        if (status === 419) {
            const cfg = error.config as (typeof error.config & { _csrfRetried?: boolean }) | undefined;
            if (cfg && !cfg._csrfRetried) {
                cfg._csrfRetried = true;
                csrfReady = false;
                return axios.get('/sanctum/csrf-cookie', { withCredentials: true }).then(() => {
                    // Drop the stale header so axios re-reads the fresh XSRF cookie on dispatch.
                    delete cfg.headers?.['X-XSRF-TOKEN'];
                    return http.request(cfg);
                });
            }
        }

        // Surface the otherwise-silent system/transient failures as a full-screen
        // error. 422 (validation) and 401/403 are left for callers/route guards.
        const showError = useAppErrorStore.getState().show;
        if (!error.response) {
            // A request the app itself aborted (React Query cancels on unmount) is
            // not an outage — never surface it.
            if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
                return Promise.reject(error);
            }

            // No response = the request died in transit. Chrome aborts in-flight
            // requests with ERR_NETWORK_CHANGED whenever the OS network route flips
            // (VPN connect/disconnect, Wi-Fi↔LAN, adapter wake) — the network is
            // usually fine again milliseconds later. Retry GETs once, silently.
            const cfg = error.config as (typeof error.config & { _netRetried?: boolean }) | undefined;
            if (cfg && (cfg.method ?? 'get').toLowerCase() === 'get' && !cfg._netRetried) {
                cfg._netRetried = true;
                return sleep(600).then(() => http.request(cfg));
            }

            // Still failing (or a non-retryable mutation): decide the banner in the
            // background with a fresh probe — one aborted request is not an outage,
            // so only take over the screen when the probe fails too.
            void (async () => {
                try {
                    await sleep(400);
                    await axios.get('/sanctum/csrf-cookie', { withCredentials: true, timeout: 5000 });
                } catch {
                    showError('network');
                }
            })();
        } else if (status === 429) {
            const retry = Number(error.response.headers?.['retry-after']);
            const retryAfter = Number.isFinite(retry) && retry > 0 ? retry : null;
            // For a logged-in user mid-session a full-screen takeover is jarring —
            // surface the throttle as a dismissable toast instead. Guests (or the
            // login screen) still get the full-screen notice.
            const loggedIn = !!queryClient.getQueryData(ME_KEY);
            if (loggedIn) {
                const detail = retryAfter ? ` Try again in about ${retryAfter} second${retryAfter > 1 ? 's' : ''}.` : '';
                useToastStore.getState().push(`Too many requests — please slow down for a moment.${detail}`, 'warning');
            } else {
                showError('rate-limit', retryAfter);
            }
        } else if (status !== undefined && status >= 500) {
            showError('server');
        }

        return Promise.reject(error);
    },
);

let csrfReady = false;

// Sanctum requires the CSRF cookie to be set before any stateful request.
export async function ensureCsrf(): Promise<void> {
    if (csrfReady) return;
    await axios.get('/sanctum/csrf-cookie', { withCredentials: true });
    csrfReady = true;
}
