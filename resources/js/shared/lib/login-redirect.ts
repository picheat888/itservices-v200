// Sends the reader to the login page with why they were signed out; when several requests or tabs fail at once,
// the first reason wins, and an idle timeout is announced so the other tabs show it too.

export type SignedOutReason = 'session_expired' | 'signed_out';

/** Channel every tab of the app listens on for session news (see useSessionTimeout). */
export const SESSION_CHANNEL = 'itsd-session';

export function createLoginRedirect(
    target: { href: string },
    announce?: () => void,
): (reason: SignedOutReason, options?: { announce?: boolean }) => void {
    let leaving = false;
    return (reason, options) => {
        if (leaving) return;
        leaving = true;
        if (reason === 'session_expired' && options?.announce !== false) announce?.();
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
export function redirectToLogin(reason: SignedOutReason, options?: { announce?: boolean }): void {
    shared ??= createLoginRedirect(window.location, announceLogout);
    shared(reason, options);
}

/** A server file link (/files/…, /pdf/…) to reopen after sign-in, from ?next=; anything else is ignored so the login page never sends people off-site. */
export function serverFileTarget(next: string | null): string | null {
    if (!next || !/^\/(files|pdf)\/[^/]/.test(next) || next.includes('//') || next.includes('\\')) return null;
    return next;
}
