// Sends the reader to the login page with why they were signed out; when several requests or tabs fail at once,
// the first reason wins, and an idle timeout is announced so the other tabs show it too.

export type SignedOutReason = 'session_expired' | 'signed_out' | 'third_device' | 'profile' | 'limit';

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

// Server end reasons that have their own login notice; idle_timeout reuses the idle notice, anything else is a plain sign-out
const DEVICE_END_REASONS = new Map<string, SignedOutReason>([
    ['third_device', 'third_device'],
    ['profile', 'profile'],
    ['limit', 'limit'],
    ['idle_timeout', 'session_expired'],
]);

/** The login notice for a 401 device_signed_out answer, or null when the answer is something else. */
export function parseDeviceSignedOut(data: unknown): { reason: SignedOutReason; by: SignedOutBy | null } | null {
    if (typeof data !== 'object' || data === null) return null;
    const { message, reason, by } = data as Record<string, unknown>;
    if (message !== 'device_signed_out') return null;
    return { reason: (typeof reason === 'string' && DEVICE_END_REASONS.get(reason)) || 'signed_out', by: parseSignedOutBy(by) };
}

/** A server file link (/files/…, /pdf/…) to reopen after sign-in, from ?next=; anything else is ignored so the login page never sends people off-site. */
export function serverFileTarget(next: string | null): string | null {
    if (!next || !/^\/(files|pdf)\/[^/]/.test(next) || next.includes('//') || next.includes('\\')) return null;
    return next;
}
