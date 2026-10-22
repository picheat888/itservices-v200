// A list row opens its detail dialog at once; the full record still loads, and a row copy never replaces a full one.
import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** Seed only an empty cache, and mark the copy stale so the dialog's query fetches the full record on mount. */
export function seedRowCopy<T>(qc: QueryClient, key: QueryKey, row: T): void {
    if (qc.getQueryData(key) !== undefined) {
        return;
    }
    qc.setQueryData(key, row);
    void qc.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
}
