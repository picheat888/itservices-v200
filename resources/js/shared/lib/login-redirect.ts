// Sends the reader to the login page with why they were signed out; when several requests or tabs fail at once,
// the first reason wins, and an idle timeout is announced so the other tabs show it too.

const SIGNED_OUT_REASONS = ['session_expired', 'signed_out', 'third_device', 'profile', 'limit', 'account_closed'] as const;

export type SignedOutReason = (typeof SIGNED_OUT_REASONS)[number];

/** The device that took this session's place (a third_device sign-out). */
export type SignedOutBy = { os: string; browser: string; location: string | null; at: string };

// sessionStorage, never the URL: the device details stay out of history and shared links
const SIGNED_OUT_BY_KEY = 'itsd:signed-out-by';

type RedirectOptions = { announce?: boolean; by?: SignedOutBy | null };

/** Channel every tab of the app listens on for session news (see useSessionTimeout). */
export const SESSION_CHANNEL = 'itsd-session';

export function createLoginRedirect(target: { href: string }, announce?: () => void): (reason: SignedOutReason, options?: RedirectOptions) => void {
    let leaving = false;
    return (reason, options) => {
        if (leaving) return;
        leaving = true;
        if (reason === 'session_expired' && options?.announce !== false) announce?.();
        if (options?.by) rememberSignedOutBy(options.by);
        else forgetSignedOutBy();
        target.href = `/login?reason=${reason}`;
    };
}

function announceLogout(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage({ type: 'logout' });
    channel.close();
}

/** Tells the other tabs which account the shared session now belongs to (see useAccountSync). */
export function announceSignIn(userId: number): void {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage({ type: 'login', userId });
    channel.close();
}

let shared: ReturnType<typeof createLoginRedirect> | null = null;

/** The app's one redirect, shared by the http client and the idle timer. */
export function redirectToLogin(reason: SignedOutReason, options?: RedirectOptions): void {
    shared ??= createLoginRedirect(window.location, announceLogout);
    shared(reason, options);
}

function rememberSignedOutBy(by: SignedOutBy): void {
    try {
        sessionStorage.setItem(SIGNED_OUT_BY_KEY, JSON.stringify(by));
    } catch {
        // Blocked storage: the notice simply leaves the device out
    }
}

function forgetSignedOutBy(): void {
    try {
        sessionStorage.removeItem(SIGNED_OUT_BY_KEY);
    } catch {
        // Blocked storage: nothing was stored either
    }
}

function parseSignedOutBy(value: unknown): SignedOutBy | null {
    if (typeof value !== 'object' || value === null) return null;
    const { os, browser, location, at } = value as Record<string, unknown>;
    if (typeof os !== 'string' || typeof browser !== 'string' || typeof at !== 'string') return null;
    if (location !== null && typeof location !== 'string') return null;
    return { os, browser, location, at };
}

/** The device named by the last sign-out, read once and cleared; null when none or storage is unavailable. */
export function readSignedOutBy(): SignedOutBy | null {
    try {
        const stored = sessionStorage.getItem(SIGNED_OUT_BY_KEY);
        if (stored === null) return null;
        sessionStorage.removeItem(SIGNED_OUT_BY_KEY);
        return parseSignedOutBy(JSON.parse(stored));
    } catch {
        return null;
    }
}

// Server end reasons and their login notice; idle_timeout reuses the idle notice, password_changed and anything unknown are a plain sign-out
const DEVICE_END_REASONS = new Map<string, SignedOutReason>([
    ['third_device', 'third_device'],
    ['profile', 'profile'],
    ['limit', 'limit'],
    ['idle_timeout', 'session_expired'],
    ['password_changed', 'signed_out'],
    ['account_closed', 'account_closed'],
]);

/** The notice for ?reason=: the app's own reasons as they are, a server end reason (a file link's redirect) as its JSON answer shows it. */
export function loginNoticeReason(reason: string | null): SignedOutReason | null {
    if (!reason) return null;
    return SIGNED_OUT_REASONS.find((known) => known === reason) ?? DEVICE_END_REASONS.get(reason) ?? null;
}

/** The login notice for a 401 device_signed_out answer, or null when the answer is something else. */
export function parseDeviceSignedOut(data: unknown): { reason: SignedOutReason; by: SignedOutBy | null } | null {
    if (typeof data !== 'object' || data === null) return null;
    const { message, reason, by } = data as Record<string, unknown>;
    if (message !== 'device_signed_out') return null;
    return { reason: (typeof reason === 'string' && DEVICE_END_REASONS.get(reason)) || 'signed_out', by: parseSignedOutBy(by) };
}

/**
 * Where a failed answer sends the reader: the login page with its reason, or null to leave it to the caller.
 * An ended device or a closed account always goes (even for /me and quiet requests), because that answer is single-shot; a plain 401 skips /me (route guard) and quiet requests.
 */
export function signedOutRedirectFor(answer: {
    status: number | undefined;
    url: string | undefined;
    quiet: boolean | undefined;
    pathname: string;
    body: unknown;
}): { reason: SignedOutReason; by: SignedOutBy | null } | null {
    if (answer.status !== 401 || answer.pathname.startsWith('/login')) return null;
    const ended = parseDeviceSignedOut(answer.body);
    if (ended) return ended;
    if (isAccountClosed(answer.body)) return { reason: 'account_closed', by: null };
    if (answer.url?.endsWith('/me') || answer.quiet) return null;
    return { reason: 'signed_out', by: null };
}

function isAccountClosed(body: unknown): boolean {
    return typeof body === 'object' && body !== null && (body as Record<string, unknown>).message === 'account_closed';
}

/** A server file link (/files/…, /pdf/…) to reopen after sign-in, from ?next=; anything else is ignored so the login page never sends people off-site. */
export function serverFileTarget(next: string | null): string | null {
    if (!next || !/^\/(files|pdf)\/[^/]/.test(next) || next.includes('//') || next.includes('\\')) return null;
    // No dot segments in the path: the browser would resolve /files/x/../../api/me to another page
    const path = next.split(/[?#]/)[0];
    if (path.includes('..') || /%2e/i.test(path)) return null;
    return next;
}
