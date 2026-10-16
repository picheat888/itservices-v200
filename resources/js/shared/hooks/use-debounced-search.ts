// The search a server-paginated list sends: follows the box once typing pauses, so a word
// costs one request instead of one per key. The box and ?search still change on every key.
import { useEffect, useState } from 'react';

export const SEARCH_DEBOUNCE_MS = 300;

/** Cleaned like the server does (zero-width dropped, spaces collapsed, trimmed), so those edits never cost a request. */
export function normalizeSearch(search: string): string {
    return search
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** The normalized search once typing pauses; clearing passes through at once. */
export function useDebouncedSearch(search: string, delay = SEARCH_DEBOUNCE_MS): string {
    const normalized = normalizeSearch(search);
    const [debounced, setDebounced] = useState(normalized);

    useEffect(() => {
        const id = window.setTimeout(() => setDebounced(normalized), normalized === '' ? 0 : delay);
        return () => window.clearTimeout(id);
    }, [normalized, delay]);

    return normalized === '' ? '' : debounced;
}
