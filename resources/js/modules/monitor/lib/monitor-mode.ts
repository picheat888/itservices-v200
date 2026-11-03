// Monitor TV decisions kept pure for node tests: which screen to show, the pairing countdown, the one CSRF retry.

export type MonitorMode = 'wait' | 'pairing' | 'board';

interface ModeInput {
    token: string | null;
    /** /me has answered, or failed for good: the TV must not wait on it forever. */
    authSettled: boolean;
    viaSession: boolean;
    /** The signed-in board answered 401/403: that session can no longer read it. */
    sessionLost: boolean;
}

export function monitorMode({ token, authSettled, viaSession, sessionLost }: ModeInput): MonitorMode {
    if (token !== null) return 'board';
    if (viaSession && !sessionLost) return 'board';
    return authSettled ? 'pairing' : 'wait';
}

/** Time left on a pairing code, counted from when its reply arrived (the TV clock may be wrong). */
export function codeLeftMs(receivedAt: number, expiresInSec: number, nowMs: number): number {
    return Math.max(0, receivedAt + expiresInSec * 1000 - nowMs);
}

const isCsrfExpired = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status === 419;

/** Runs a POST; on 419 (stale CSRF cookie) refreshes the cookie and runs it once more. */
export async function withCsrfRetry<T>(call: () => Promise<T>, refreshCsrf: () => Promise<void>): Promise<T> {
    try {
        return await call();
    } catch (error) {
        if (!isCsrfExpired(error)) throw error;
        await refreshCsrf();
        return call();
    }
}
