// Rows the user just created on one list: drawn first for a minute, from the list itself or, when the page lacks them, the record's own detail query.
import { httpStatus } from '@/shared/lib/http-errors';
import { dropOnMissing, heldIds, liveIds, nextExpiry, pinOrder, type RowId } from '@/shared/lib/new-rows';
import { currentUserId, dropNew, useNewRowsStore } from '@/stores/new-rows';
import { useQueries, type QueryKey } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

interface NewRowsOptions<T> {
    /** The list's name, the same one its create mutation passes to markNew. */
    scope: string;
    /** Rows the list holds now (the current page, or every row for a client-side list). */
    rows: T[];
    rowKey: (row: T) => RowId;
    /** Fetches a pinned record the current page does not hold; leave out for lists that hold every row. */
    detail?: { key: (id: RowId) => QueryKey; fetch: (id: RowId) => Promise<T> };
    /** False where the list is off screen or is a view the record may not belong to: only rows already on the page are pinned. */
    active?: boolean;
    /** The list is still loading: hold the detail fetches until it answers (the record is often on the page). */
    waiting?: boolean;
    /** For a list that holds every row: its search, filters and page, so a pin that ran out returns to its place when they change. */
    view?: string;
}

export interface NewRows<T> {
    /** Rows to draw first, newest save on top. */
    pinned: T[];
    /** Pinned and still inside its minute (tint and badge). */
    isNew: (row: T) => boolean;
}

export function useNewRows<T>({ scope, rows, rowKey, detail, active = true, waiting = false, view }: NewRowsOptions<T>): NewRows<T> {
    const entries = useNewRowsStore((s) => s.entries);
    const user = currentUserId();
    const [now, setNow] = useState(() => Date.now());
    const live = useMemo(() => (user === null ? [] : liveIds(entries, user, scope, now)), [entries, user, scope, now]);

    // A pin that runs out keeps its place (without tint or badge) until the list or its view changes, so nothing jumps under a tap
    const [held, setHeld] = useState<{ rows: T[]; view: string | undefined; ids: RowId[] }>({ rows, view, ids: [] });
    const shown = useRef<RowId[]>([]);
    const ids = pinOrder(live, heldIds(held, rows, view));
    useEffect(() => {
        shown.current = ids;
    });

    // Re-render when the next pin runs out
    useEffect(() => {
        const wait = nextExpiry(entries, Date.now());
        if (wait === null) return;
        const timer = window.setTimeout(() => {
            const at = Date.now();
            const stillLive = user === null ? [] : liveIds(entries, user, scope, at);
            setHeld({ rows, view, ids: shown.current.filter((id) => !stillLive.includes(id)) });
            setNow(at);
        }, wait + 50);
        return () => window.clearTimeout(timer);
    }, [entries, now, rows, view, user, scope]);

    const onPage = useMemo(() => new Map(rows.map((r) => [rowKey(r), r] as const)), [rows, rowKey]);
    const missing = detail && active ? ids.filter((id) => !onPage.has(id)) : [];

    const fetched = useQueries({
        queries: missing.map((id) => ({
            queryKey: [...detail!.key(id), 'new-row'],
            queryFn: () => detail!.fetch(id),
            enabled: !waiting,
            meta: { quietServerError: true },
        })),
    });

    // A pinned record that was deleted or is no longer visible leaves the list quietly
    const gone = missing.filter((_, i) => dropOnMissing(httpStatus(fetched[i]?.error)));
    useEffect(() => {
        gone.forEach((id) => dropNew(scope, id));
    }, [gone.join('|'), scope]); // eslint-disable-line react-hooks/exhaustive-deps

    const fromDetail = new Map<RowId, T>();
    missing.forEach((id, i) => {
        const data = fetched[i]?.data;
        if (data !== undefined && !gone.includes(id)) fromDetail.set(id, data);
    });

    const pinned = ids.flatMap((id) => {
        const row = onPage.get(id) ?? fromDetail.get(id);
        return row === undefined ? [] : [row];
    });
    const liveSet = new Set(live);

    return {
        pinned,
        isNew: (row) => liveSet.has(rowKey(row)),
    };
}
