import { translate } from '@/lang';
import { serverFailureText } from '@/shared/lib/api-errors';
import { rememberRequestId } from '@/shared/lib/client-error-report';
import {
    httpStatus,
    isQuietServerError,
    isServerFailure,
    requestIdOf,
    retryAfterOf,
    serviceUnavailableKind,
    showsOwnThrottle,
    wasShownInline,
} from '@/shared/lib/http-errors';
import { redirectToLogin, signedOutRedirectFor } from '@/shared/lib/login-redirect';
import { formatNumber } from '@/shared/lib/number';
import { ME_KEY, queryClient } from '@/shared/lib/query-client';
import { useAppErrorStore } from '@/stores/app-error';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import axios from 'axios';

// Axios for the same-origin API: Sanctum cookie auth (XSRF-TOKEN cookie -> X-XSRF-TOKEN header) plus app-wide error handling.
declare module 'axios' {
    interface AxiosRequestConfig {
        /** A 401 here is an answer, not a lost session (start-up prefetch before sign-in is known). */
        quietUnauthenticated?: boolean;
        /** A background poll: a 5xx is retried by its query, not shown as the full-screen error. */
        quietServerError?: boolean;
    }
}

export const http = axios.create({
    baseURL: '/api',
    withCredentials: true,
    withXSRFToken: true,
    headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    },
});

// The reader's language, read per request, so server messages come back in it (SetRequestLocale)
http.interceptors.request.use((cfg) => {
    cfg.headers.set('X-Locale', useUiStore.getState().lang);
    return cfg;
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

http.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status as number | undefined;
        const requestId = (error?.response?.headers?.['x-request-id'] as string | undefined) ?? null;
        rememberRequestId(requestId);

        // Idle timeout (CheckSessionTimeout)
        if (status === 401 && error.response.data?.message === 'session_expired' && !window.location.pathname.startsWith('/login')) {
            redirectToLogin('session_expired');
            return Promise.reject(error);
        }

        // Any other 401 on a working screen: signed out elsewhere, with the reason when this device was ended (a plain /me 401 is left to the route guard)
        const signedOut = signedOutRedirectFor({
            status,
            url: error.config?.url,
            quiet: error.config?.quietUnauthenticated,
            pathname: window.location.pathname,
            body: error.response?.data,
        });
        if (signedOut) {
            redirectToLogin(signedOut.reason, { by: signedOut.by });
            return Promise.reject(error);
        }

        // 419 = stale CSRF token: refresh the cookie and replay once
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

        // Full-screen error for outages; 401/403/422 are left to callers, other 5xx to the cache handlers below
        const showError = useAppErrorStore.getState().show;
        if (!error.response) {
            // Aborted by the app (React Query on unmount): not an outage
            if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
                return Promise.reject(error);
            }

            // Died in transit (e.g. ERR_NETWORK_CHANGED on a VPN or Wi-Fi switch): retry a GET once
            const cfg = error.config as (typeof error.config & { _netRetried?: boolean }) | undefined;
            if (cfg && (cfg.method ?? 'get').toLowerCase() === 'get' && !cfg._netRetried) {
                cfg._netRetried = true;
                return sleep(600).then(() => http.request(cfg));
            }

            // Show the outage screen only if a fresh probe fails too
            void sleep(400)
                .then(serverReachable)
                .then((reachable) => {
                    if (!reachable) showError('network');
                });
        } else if (status === 429 && showsOwnThrottle(error.config?.url)) {
            // The login page and its device dialog show their own throttle wait inline
            return Promise.reject(error);
        } else if (status === 429) {
            const retryAfter = retryAfterOf(error);
            // Signed in: a toast, not a full-screen takeover
            const loggedIn = !!queryClient.getQueryData(ME_KEY);
            if (loggedIn) {
                const wait = retryAfter ?? 5;
                // One key for every throttled call, so parallel 429s with different waits collapse into one toast
                useToastStore
                    .getState()
                    .push(
                        translate(useUiStore.getState().lang, 'err_throttle_toast').replace('{n}', formatNumber(wait, useUiStore.getState().lang)),
                        'warning',
                        undefined,
                        undefined,
                        {
                            key: 'http-throttle',
                        },
                    );
            } else {
                showError('rate-limit', retryAfter);
            }
        } else if (status === 503) {
            // Maintenance or a full database answers everything the same way, so every caller waits
            showError(serviceUnavailableKind(error), retryAfterOf(error));
        }

        return Promise.reject(error);
    },
);

// A read that still fails after its retries takes over the screen, unless the screen still has its last answer
queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'error') return;
    const error = event.action.error;
    if (event.query.state.data !== undefined || !isServerFailure(error) || isQuietServerError(error) || httpStatus(error) === 503) return;
    useAppErrorStore.getState().show('server', null, requestIdOf(error));
});

// A failed save is the form's to show (serverMessage); a toast stands in only when nothing on screen took it
queryClient.getMutationCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'error') return;
    const error = event.action.error;
    if (!isServerFailure(error) || isQuietServerError(error) || httpStatus(error) === 503) return;
    // Runs before mutateAsync's caller catches the error, so wait for it
    setTimeout(() => {
        if (wasShownInline(error)) return;
        const lang = useUiStore.getState().lang;
        useToastStore.getState().push(serverFailureText(error), 'error', translate(lang, 'err_server_title'), undefined, { key: 'http-server' });
    }, 0);
});

/** A light call outside the API throttle, to tell a dropped connection from one failed request. */
export async function serverReachable(): Promise<boolean> {
    try {
        await axios.get('/sanctum/csrf-cookie', { withCredentials: true, timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

let csrfReady = false;

// Sanctum requires the CSRF cookie to be set before any stateful request.
export async function ensureCsrf(): Promise<void> {
    if (csrfReady) return;
    await axios.get('/sanctum/csrf-cookie', { withCredentials: true });
    csrfReady = true;
}
