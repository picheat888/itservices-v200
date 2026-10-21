// When data the user opens again (a dropdown, a tab, a dialog) may be asked for again: never twice within five seconds.

export const FRESH_MS = 5000;

/** True when `force` (a user-pressed reload), never fetched, or fetched FRESH_MS or more ago. */
export function shouldRefetch(force: boolean, dataUpdatedAt: number, now: number): boolean {
    return force || dataUpdatedAt === 0 || now - dataUpdatedAt >= FRESH_MS;
}

/** shouldRefetch, but never while a request for the same data is still running. */
export function shouldRequest(force: boolean, fetching: boolean, dataUpdatedAt: number, now: number): boolean {
    return !fetching && shouldRefetch(force, dataUpdatedAt, now);
}
