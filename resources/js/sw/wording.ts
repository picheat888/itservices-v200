// Admin wording overrides as the service worker stores them, and the check that a message came from an app tab.
// Pure (no imports) so node tests can load it.

export type Wording = Record<string, { en?: string; th?: string }>;

/** Only string en/th values survive; an entry with neither is dropped. */
export function sanitizeWording(data: unknown): Wording {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const clean: Wording = {};
    for (const [key, value] of Object.entries(data)) {
        if (!value || typeof value !== 'object') continue;
        const { en, th } = value as { en?: unknown; th?: unknown };
        const entry: { en?: string; th?: string } = {};
        if (typeof en === 'string') entry.en = en;
        if (typeof th === 'string') entry.th = th;
        if (entry.en !== undefined || entry.th !== undefined) clean[key] = entry;
    }
    return clean;
}

/** A message's `source` is a page (WindowClient), not another worker or a port. */
export function isWindowSource(source: unknown): boolean {
    return !!source && typeof source === 'object' && (source as { type?: unknown }).type === 'window';
}
