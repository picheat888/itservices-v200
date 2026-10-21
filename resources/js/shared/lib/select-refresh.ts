// Dropdown refresh helpers: keep the highlight on its item when the list reloads, and spot a chosen value that left the list.

/** Where the highlighted option sits after a reload: the same value if it is still there, else clamped to the new end. */
export function keepActiveIndex(prev: readonly { value: string }[], next: readonly { value: string }[], prevIndex: number): number {
    const value = prev[prevIndex]?.value;
    const found = value === undefined ? -1 : next.findIndex((o) => o.value === value);
    if (found >= 0) {
        return found;
    }
    return Math.max(0, Math.min(prevIndex, next.length - 1));
}

/** A chosen value is removed only once the list has loaded and no longer holds it. */
export function isRemovedValue(value: string, options: readonly { value: string }[], listLoaded: boolean): boolean {
    return listLoaded && value !== '' && !options.some((o) => o.value === value);
}
