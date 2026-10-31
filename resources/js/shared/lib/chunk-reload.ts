// After a deploy, an open tab can ask for page files the new build no longer has; reload once to pick it up.

const RELOADED_AT_KEY = 'itsd-chunk-reload';

/** A second failure within this window shows the error instead of reloading again. */
export const CHUNK_RELOAD_WINDOW_MS = 60_000;

let pageLoadsWaiting = 0;

/** Marks a page the user is opening, so a failed download of it may reload; a failed preload never does. */
export function trackPageLoad<T>(load: Promise<T>): Promise<T> {
    pageLoadsWaiting++;
    return load.finally(() => {
        pageLoadsWaiting--;
    });
}

export function isPageLoadWaiting(): boolean {
    return pageLoadsWaiting > 0;
}

/** Reloads the page unless offline, storage is blocked, or it already reloaded within the window. Returns whether it did. */
export function reloadForNewBuild(now = Date.now()): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    try {
        const last = Number(window.sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);
        if (now - last < CHUNK_RELOAD_WINDOW_MS) return false;
        window.sessionStorage.setItem(RELOADED_AT_KEY, String(now));
    } catch {
        return false;
    }
    window.location.reload();
    return true;
}
