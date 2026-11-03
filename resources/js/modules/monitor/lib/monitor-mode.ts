// Monitor TV decisions kept pure for node tests: which screen to show, the pairing countdown, the one CSRF retry.

export type MonitorMode = 'pairing' | 'board';

/** Only a paired device sees the board; a signed-in browser pairs like a TV. */
export function monitorMode(token: string | null): MonitorMode {
    return token !== null ? 'board' : 'pairing';
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

const CONTROLS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A']);

/** Space pauses the page rotation, unless it is pressing a button or typing in a field. */
export function togglesPause(key: string, targetTag: string): boolean {
    return key === ' ' && !CONTROLS.has(targetTag.toUpperCase());
}
