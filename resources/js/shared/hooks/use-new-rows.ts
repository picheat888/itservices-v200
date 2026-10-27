// Rows the user just created on one list: drawn first for a minute, from the list itself or, when the page lacks them, the record's own detail query.
import { httpStatus } from '@/shared/lib/http-errors';
import { dropOnMissing, liveIds, nextExpiry, type RowId } from '@/shared/lib/new-rows';
import { currentUserId, dropNew, useNewRowsStore } from '@/stores/new-rows';
import { useQueries, type QueryKey } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

interface NewRowsOptions<T> {
    /** The list's name, the same one its create form passes to markNew. */
    scope: string;
    /** Rows the list holds now (the current page, or every row for a client-side list). */
    rows: T[];
    rowKey: (row: T) => RowId;
    /** Fetches a pinned record the current page does not hold; leave out for lists that hold every row. */
    detail?: { key: (id: RowId) => QueryKey; fetch: (id: RowId) => Promise<T> };
}

export interface NewRows<T> {
    /** Rows to draw first, newest save on top. */
    pinned: T[];
    isNew: (row: T) => boolean;
    /** The row is shown only because it is pinned (another page, or outside the filter). */
    isPinnedOnly: (row: T) => boolean;
}

export function useNewRows<T>({ scope, rows, rowKey, detail }: NewRowsOptions<T>): NewRows<T> {
    const entries = useNewRowsStore((s) => s.entries);
    const user = currentUserId();
    const [now, setNow] = useState(() => Date.now());

    // Re-render when the next pin runs out
    useEffect(() => {
        const wait = nextExpiry(entries, Date.now());
        if (wait === null) return;
        const timer = window.setTimeout(() => setNow(Date.now()), wait + 50);
        return () => window.clearTimeout(timer);
    }, [entries, now]);

    const ids = useMemo(() => (user === null ? [] : liveIds(entries, user, scope, now)), [entries, user, scope, now]);
    const onPage = useMemo(() => new Map(rows.map((r) => [rowKey(r), r] as const)), [rows, rowKey]);
    const missing = detail ? ids.filter((id) => !onPage.has(id)) : [];

    const fetched = useQueries({
        queries: missing.map((id) => ({
            queryKey: detail!.key(id),
            queryFn: () => detail!.fetch(id),
            retry: false,
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
    const live = new Set(ids);

    return {
        pinned,
        isNew: (row) => live.has(rowKey(row)),
        isPinnedOnly: (row) => fromDetail.has(rowKey(row)),
    };
}
