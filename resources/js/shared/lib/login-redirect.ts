// Sends the reader to the login page with why they were signed out; when several requests fail at once, the first reason wins.

export type SignedOutReason = 'session_expired' | 'signed_out';

export function createLoginRedirect(target: { href: string }): (reason: SignedOutReason) => void {
    let leaving = false;
    return (reason) => {
        if (leaving) return;
        leaving = true;
        target.href = `/login?reason=${reason}`;
    };
}

let shared: ((reason: SignedOutReason) => void) | null = null;

/** The app's one redirect, shared by the http client and the idle timer. */
export function redirectToLogin(reason: SignedOutReason): void {
    shared ??= createLoginRedirect(window.location);
    shared(reason);
}
