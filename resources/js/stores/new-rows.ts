// Rows the signed-in user just created, pinned on top of their list for a minute; kept per browser tab (sessionStorage) so F5 keeps them.
import { addEntries, dropEntry, forUser, pruneExpired, restoreEntries, type NewRowEntry, type RowId } from '@/shared/lib/new-rows';
import { ME_KEY, queryClient } from '@/shared/lib/query-client';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface NewRowsState {
    entries: NewRowEntry[];
}

export const useNewRowsStore = create<NewRowsState>()(
    persist(() => ({ entries: [] as NewRowEntry[] }), {
        name: 'itservices-new-rows',
        storage: createJSONStorage(() => sessionStorage),
        merge: (persisted, current) => ({ ...current, entries: restoreEntries(persisted, Date.now()) }),
    }),
);

/** The signed-in user's id, or null before sign-in. */
export function currentUserId(): number | null {
    return queryClient.getQueryData<{ id: number } | null>(ME_KEY)?.id ?? null;
}

// Signing out or another user signing in on this tab drops every pin that is not theirs
queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    if (JSON.stringify(event.query.queryKey) !== JSON.stringify(ME_KEY)) return;
    const user = (event.query.state.data as { id: number } | null | undefined)?.id ?? null;
    const { entries } = useNewRowsStore.getState();
    const kept = forUser(entries, user);
    if (kept.length !== entries.length) useNewRowsStore.setState({ entries: kept });
});

/** Pin rows the user just saved on the list named by `scope`. */
export function markNew(scope: string, ids: RowId | RowId[]): void {
    const user = currentUserId();
    if (user === null) return;
    const list = Array.isArray(ids) ? ids : [ids];
    const now = Date.now();
    useNewRowsStore.setState((s) => ({ entries: addEntries(forUser(pruneExpired(s.entries, now), user), user, scope, list, now) }));
}

/** Unpin a row, e.g. after it was deleted. */
export function dropNew(scope: string, id: RowId): void {
    const user = currentUserId();
    if (user === null) return;
    useNewRowsStore.setState((s) => ({ entries: dropEntry(s.entries, user, scope, id) }));
}

/** Forget every pin (sign-out). */
export function clearNewRows(): void {
    useNewRowsStore.setState({ entries: [] });
}
