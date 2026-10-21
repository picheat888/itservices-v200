// A tab's refresh mark from its query's background fetching: spinner while fetching, a short check after, then nothing.
import { nextRefreshMark, REFRESH_DONE_MS, type RefreshMark } from '@/shared/lib/refresh-mark';
import { useEffect, useState } from 'react';

/** `fetching` should be background fetching only (`isFetching && !isLoading`); the first load has its own skeleton. */
export function useRefreshMark(fetching: boolean): RefreshMark {
    const [mark, setMark] = useState<RefreshMark>('idle');
    const next = nextRefreshMark(mark, fetching);
    if (next !== mark) setMark(next);

    useEffect(() => {
        if (mark !== 'done') return;
        const id = setTimeout(() => setMark('idle'), REFRESH_DONE_MS);
        return () => clearTimeout(id);
    }, [mark]);

    return next;
}
