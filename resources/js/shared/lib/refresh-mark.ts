// The tab refresh mark: 'busy' while a background refetch runs, 'done' for a moment after new data arrived, then 'idle'.

export type RefreshMark = 'idle' | 'busy' | 'done';

export const REFRESH_DONE_MS = 1500;

/** The next mark; `advanced` = the data's updatedAt moved since the refetch began. 'done' is cleared by a timer, not here. */
export function nextRefreshMark(prev: RefreshMark, fetching: boolean, advanced: boolean): RefreshMark {
    if (fetching) {
        return 'busy';
    }
    if (prev === 'busy') {
        return advanced ? 'done' : 'idle';
    }
    return prev;
}

/** One mark for a whole tab bar's status announcement: busy wins over done. */
export function barRefreshMark(marks: readonly (RefreshMark | undefined)[]): RefreshMark {
    if (marks.includes('busy')) {
        return 'busy';
    }
    return marks.includes('done') ? 'done' : 'idle';
}
