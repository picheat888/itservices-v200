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

/** The query state a tab's mark reads. */
export type TabSource = { isFetching: boolean; isLoading: boolean; isPlaceholderData: boolean; dataUpdatedAt: number };

/** A refetch of data already on screen; a first load or a new filter shows its own skeleton instead. */
export function isBackgroundFetch(s: TabSource): boolean {
    return s.isFetching && !s.isLoading && !s.isPlaceholderData;
}

/** Moves whenever any of the tab's sources brings new data. */
export function tabStamp(sources: readonly TabSource[]): number {
    return sources.reduce((sum, s) => sum + s.dataUpdatedAt, 0);
}

export type TabMarkState<T extends string> = { tab: T; mark: RefreshMark; since: number };

/** The active tab's next mark; switching tabs starts the new tab clean, so a check never lands on a tab that did not refetch. */
export function nextTabMark<T extends string>(prev: TabMarkState<T>, active: T, fetching: boolean, stamp: number): TabMarkState<T> {
    if (prev.tab !== active) {
        return { tab: active, mark: fetching ? 'busy' : 'idle', since: stamp };
    }
    const mark = nextRefreshMark(prev.mark, fetching, stamp > prev.since);
    const since = mark === 'busy' && prev.mark !== 'busy' ? stamp : prev.since;
    return mark === prev.mark && since === prev.since ? prev : { tab: active, mark, since };
}
