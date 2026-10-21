// Dropdown refresh helpers: keep the highlight on its item when the list reloads, spot a chosen value that left the list, and pick what the open menu shows.

type Valued = readonly { value: string }[];

/** Where the highlighted option sits after a reload: the same value if it is still there, else clamped to the new end. */
export function keepActiveIndex(prev: Valued, next: Valued, prevIndex: number): number {
    const value = prev[prevIndex]?.value;
    const found = value === undefined ? -1 : next.findIndex((o) => o.value === value);
    if (found >= 0) {
        return found;
    }
    return Math.max(0, Math.min(prevIndex, next.length - 1));
}

/** After the options change: a reloading list moves the highlight with its item; an async picker's new results keep the index. */
export function nextActiveIndex(reloading: boolean, prev: Valued, next: Valued, prevIndex: number): number {
    return reloading ? keepActiveIndex(prev, next, prevIndex) : prevIndex;
}

/** A chosen value is removed only once the list has loaded and no longer holds it. */
export function isRemovedValue(value: string, options: Valued, listLoaded: boolean): boolean {
    return listLoaded && value !== '' && !options.some((o) => o.value === value);
}

export type MenuBody = 'list' | 'skeleton' | 'empty' | 'dash';

/** What the open menu shows when it has no rows: a skeleton while a first load or an async search runs, else the empty state or a dash. */
export function menuBody(s: { count: number; query: string; reloading: boolean; loaded: boolean; failed: boolean; asyncLoading: boolean }): MenuBody {
    if (s.count > 0) {
        return 'list';
    }
    if (s.asyncLoading || (s.reloading && !s.loaded && !s.failed)) {
        return 'skeleton';
    }
    return s.query !== '' || s.reloading ? 'empty' : 'dash';
}

/** Tab leaves the menu from its last control, Shift+Tab from its first (the search box); between them focus moves inside. */
export function tabLeavesMenu(index: number, count: number, shift: boolean): boolean {
    return shift ? index === 0 : index === count - 1;
}
