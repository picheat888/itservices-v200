import { useAppErrorStore } from '@/stores/app-error';
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
http.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error?.response?.status as number | undefined;

        if (status === 401 && error.response.data?.message === 'session_expired' && !window.location.pathname.startsWith('/login')) {
            window.location.href = '/login?reason=session_expired';
            return Promise.reject(error);
        }

        // Surface the otherwise-silent system/transient failures as a full-screen
        // error. 422 (validation) and 401/403 are left for callers/route guards.
        const showError = useAppErrorStore.getState().show;
        if (!error.response) {
            showError('network');
        } else if (status === 429) {
            const retry = Number(error.response.headers?.['retry-after']);
            showError('rate-limit', Number.isFinite(retry) && retry > 0 ? retry : null);
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
