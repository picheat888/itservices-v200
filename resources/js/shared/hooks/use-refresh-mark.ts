// A tab's refresh mark from its query's background fetching: spinner while fetching, a short check once new data arrived, then nothing.
import { nextRefreshMark, REFRESH_DONE_MS, type RefreshMark } from '@/shared/lib/refresh-mark';
import { useEffect, useState } from 'react';

/** `fetching` should be background fetching only (`isFetching && !isLoading`); `dataUpdatedAt` tells a finished refetch from a failed or abandoned one. */
export function useRefreshMark(fetching: boolean, dataUpdatedAt: number): RefreshMark {
    const [state, setState] = useState<{ mark: RefreshMark; since: number }>({ mark: 'idle', since: dataUpdatedAt });
    const next = nextRefreshMark(state.mark, fetching, dataUpdatedAt > state.since);
    if (next !== state.mark) setState({ mark: next, since: next === 'busy' ? dataUpdatedAt : state.since });

    useEffect(() => {
        if (state.mark !== 'done') return;
        const id = setTimeout(() => setState((s) => ({ ...s, mark: 'idle' })), REFRESH_DONE_MS);
        return () => clearTimeout(id);
    }, [state.mark]);

    return next;
}
