// A list page's search, filters, page and rows-per-page kept in the URL query string, so a
// reload or a shared link shows the same list. Defaults stay out of the URL.
import { PAGE_SIZES } from '@/shared/components/data-table';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export type ListParamPatch = Record<string, string | null>;

export function useListParams() {
    const [searchParams, setSearchParams] = useSearchParams();

    // Writes in one handler merge into one URL replace, built from the live URL so a delayed write never undoes a newer one.
    const pending = useRef<ListParamPatch | null>(null);
    const setParams = (patch: ListParamPatch) => {
        const first = pending.current === null;
        pending.current = { ...(pending.current ?? {}), ...patch };
        if (!first) return;
        queueMicrotask(() => {
            const merged = pending.current ?? {};
            pending.current = null;
            setSearchParams(
                () => {
                    const next = new URLSearchParams(window.location.search);
                    for (const [key, value] of Object.entries(merged)) {
                        if (value === null || value === '') next.delete(key);
                        else next.set(key, value);
                    }
                    return next;
                },
                { replace: true },
            );
        });
    };

    const get = (key: string) => searchParams.get(key) ?? '';
    const page = Math.max(1, Math.floor(Number(searchParams.get('page'))) || 1);
    const perParam = Number(searchParams.get('per'));
    const perPage = PAGE_SIZES.includes(perParam) ? perParam : PAGE_SIZES[0];

    /** Set a filter (or the search) and return to page 1 in the same write. */
    const setFilter = (key: string, value: string) => setParams({ [key]: value || null, page: null });

    /** Props for a client-side DataTable: `search` (?search) and `paging` (?page, ?per). */
    const table = {
        search: { value: get('search'), onChange: (value: string) => setFilter('search', value) },
        paging: {
            page,
            pageSize: perPage,
            onPageChange: (next: number) => setParams({ page: next > 1 ? String(next) : null }),
            onPageSizeChange: (size: number) => setParams({ per: size === PAGE_SIZES[0] ? null : String(size), page: null }),
        },
    };

    return { searchParams, get, setParams, setFilter, page, perPage, table };
}

/** For a list with its own pager: a ?page past the last one (an old link, a shrunk list) moves to the last page. */
export function usePageInRange(list: ReturnType<typeof useListParams>, lastPage: number | undefined) {
    useEffect(() => {
        if (lastPage !== undefined && lastPage >= 1 && list.page > lastPage) list.setParams({ page: lastPage > 1 ? String(lastPage) : null });
    }, [lastPage, list.page]); // eslint-disable-line react-hooks/exhaustive-deps
}
