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

let csrfReady = false;

// Sanctum requires the CSRF cookie to be set before any stateful request.
export async function ensureCsrf(): Promise<void> {
    if (csrfReady) return;
    await axios.get('/sanctum/csrf-cookie', { withCredentials: true });
    csrfReady = true;
}
