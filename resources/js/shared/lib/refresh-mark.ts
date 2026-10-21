// The tab refresh mark: 'busy' while a background refetch runs, 'done' for a moment after, then 'idle'.

export type RefreshMark = 'idle' | 'busy' | 'done';

export const REFRESH_DONE_MS = 1500;

/** The next mark for the current fetching state; 'done' is cleared by a timer, not here. */
export function nextRefreshMark(prev: RefreshMark, fetching: boolean): RefreshMark {
    if (fetching) {
        return 'busy';
    }
    return prev === 'busy' ? 'done' : prev;
}
