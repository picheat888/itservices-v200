// Newly created rows pinned on top of a list for one minute: entries per user and list, expiry, order and dedupe.

/** How long a new row stays pinned, counted from its save. */
export const NEW_ROW_MS = 60_000;

export type RowId = string | number;

export interface NewRowEntry {
    user: number;
    scope: string;
    id: RowId;
    at: number;
}

const same = (e: NewRowEntry, user: number, scope: string, id: RowId) => e.user === user && e.scope === scope && e.id === id;

const isLive = (e: NewRowEntry, now: number) => now - e.at < NEW_ROW_MS;

/** Pin ids saved together at `now`; an id already pinned moves to the top with the new time. */
export function addEntries(entries: NewRowEntry[], user: number, scope: string, ids: RowId[], now: number): NewRowEntry[] {
    const kept = entries.filter((e) => !ids.some((id) => same(e, user, scope, id)));
    return [...ids.map((id) => ({ user, scope, id, at: now })), ...kept];
}

export function dropEntry(entries: NewRowEntry[], user: number, scope: string, id: RowId): NewRowEntry[] {
    return entries.filter((e) => !same(e, user, scope, id));
}

export function pruneExpired(entries: NewRowEntry[], now: number): NewRowEntry[] {
    return entries.filter((e) => isLive(e, now));
}

/** Live pinned ids of one list, newest save first; ids of one save keep the order they were given. */
export function liveIds(entries: NewRowEntry[], user: number, scope: string, now: number): RowId[] {
    return entries
        .map((e, index) => ({ e, index }))
        .filter(({ e }) => e.user === user && e.scope === scope && isLive(e, now))
        .sort((a, b) => b.e.at - a.e.at || a.index - b.index)
        .map(({ e }) => e.id);
}

/** Milliseconds until the soonest live pin ends, or null when none is live. */
export function nextExpiry(entries: NewRowEntry[], now: number): number | null {
    const left = entries.filter((e) => isLive(e, now)).map((e) => e.at + NEW_ROW_MS - now);
    return left.length ? Math.min(...left) : null;
}

/** The page rows without the pinned ones, so a pinned row is drawn once. */
export function splitPinned<T>(rows: T[], pinned: T[], rowKey: (r: T) => RowId): T[] {
    if (!pinned.length) return rows;
    const keys = new Set(pinned.map(rowKey));
    return rows.filter((r) => !keys.has(rowKey(r)));
}

/** A pinned record that is gone (404) or no longer visible (403) is dropped. */
export function dropOnMissing(status: number | undefined): boolean {
    return status === 404 || status === 403;
}

/** Live pins first, then pins that just ran out and keep their place until the list changes. */
export function pinOrder(live: RowId[], held: RowId[]): RowId[] {
    return [...live, ...held.filter((id) => !live.includes(id))];
}

const isEntry = (e: unknown): e is NewRowEntry => {
    const x = e as Partial<NewRowEntry> | null;
    return !!x && typeof x.user === 'number' && typeof x.scope === 'string' && typeof x.at === 'number' && (typeof x.id === 'number' || typeof x.id === 'string');
};

/** Pins read back from storage: well-formed and still live only. */
export function restoreEntries(persisted: unknown, now: number): NewRowEntry[] {
    const list = (persisted as { entries?: unknown } | undefined)?.entries;
    return Array.isArray(list) ? pruneExpired(list.filter(isEntry), now) : [];
}

/** Only the signed-in user's pins (none when signed out). */
export function forUser(entries: NewRowEntry[], user: number | null): NewRowEntry[] {
    return user === null ? [] : entries.filter((e) => e.user === user);
}
