// Clicking a push: the service worker asks an open tab to go to the push's target, and the tab routes in the app.
// Pure (no imports) so the service worker and node tests can load it.

export interface PushOpenMessage {
    type: 'open';
    url: string;
}

export type PushOpenTarget = { kind: 'bell' } | { kind: 'path'; to: string };

export function pushOpenMessage(url: string): PushOpenMessage {
    return { type: 'open', url };
}

/** Where the app goes for a message from the worker; null for anything that is not a same-origin open. */
export function pushOpenTarget(message: unknown, origin: string): PushOpenTarget | null {
    if (!message || typeof message !== 'object') return null;
    const { type, url } = message as { type?: unknown; url?: unknown };
    if (type !== 'open' || typeof url !== 'string') return null;

    let parsed: URL;
    try {
        parsed = new URL(url, origin);
    } catch {
        return null;
    }
    if (parsed.origin !== origin) return null;

    const onlyBell = parsed.pathname === '/' && parsed.searchParams.get('bell') === '1' && [...parsed.searchParams.keys()].length === 1;
    if (onlyBell && parsed.hash === '') return { kind: 'bell' };

    return { kind: 'path', to: `${parsed.pathname}${parsed.search}${parsed.hash}` };
}
