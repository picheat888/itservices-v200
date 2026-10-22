// When data the user opens again (a dropdown, a tab, a dialog) may be asked for again: never twice within five seconds.

export const FRESH_MS = 5000;

/** True when `force` (a user-pressed reload), never fetched, or fetched FRESH_MS or more ago. */
export function shouldRefetch(force: boolean, dataUpdatedAt: number, now: number): boolean {
    return force || dataUpdatedAt === 0 || now - dataUpdatedAt >= FRESH_MS;
}

/** Query options for data on screen (lists, tab contents, open dialogs): asked again after five seconds, and on browser-tab return. */
export const FRESH_VIEW = { staleTime: FRESH_MS, refetchOnWindowFocus: true } as const;

/** Query options for a dropdown's source list: asked again when its dropdown opens (useSelectRefresh), not on browser-tab return. */
export const FRESH_LIST = { staleTime: FRESH_MS } as const;

/** A lookup list hook's options; a screen that shows the list as a table passes `refetchOnWindowFocus: true`. */
export type LookupOptions = { refetchOnWindowFocus?: boolean };

/** True only on the closed-to-open step of a dialog. */
export function justOpened(wasOpen: boolean, open: boolean): boolean {
    return !wasOpen && open;
}

/** shouldRefetch, but never while a request for the same data is still running. */
export function shouldRequest(force: boolean, fetching: boolean, dataUpdatedAt: number, now: number): boolean {
    return !fetching && shouldRefetch(force, dataUpdatedAt, now);
}

/** A dialog asks for its data again only on the step that opens it, and only when that data is five seconds old. */
export function refetchOnOpenRule(wasOpen: boolean, open: boolean, fetching: boolean, dataUpdatedAt: number, now: number): boolean {
    return justOpened(wasOpen, open) && shouldRequest(false, fetching, dataUpdatedAt, now);
}
