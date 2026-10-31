// After a deploy, an open tab can ask for page files the new build no longer has; reload once to pick it up.

const RELOADED_AT_KEY = 'itsd:chunk-reload-at';

/** A second failure within this window shows the error instead of reloading again. */
export const CHUNK_RELOAD_WINDOW_MS = 10_000;

/** The browser could not fetch a page file (Chrome, Safari, Firefox wording, or Vite's CSS preload). */
export function isChunkLoadError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
        message,
    );
}

/** Reloads the page unless offline, storage is blocked, or it already reloaded moments ago. Returns whether it did. */
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
