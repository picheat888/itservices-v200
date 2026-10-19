// Sidebar menu scrolling: which ends still hide items, and how far to move so the open page's item shows.

/** Height (px) of the bottom fade and its ▾ button; the top fade is shorter. */
export const FADE_BELOW = 56;
export const FADE_ABOVE = 28;

export interface ScrollEdges {
    above: boolean;
    below: boolean;
}

export function scrollEdges(scrollTop: number, clientHeight: number, scrollHeight: number): ScrollEdges {
    return { above: scrollTop > 0, below: scrollTop + clientHeight < scrollHeight - 1 };
}

/** Pixels to scroll so an item clears both fades (0 when it already does). */
export function revealOffset(item: { top: number; bottom: number }, box: { top: number; bottom: number }): number {
    if (item.bottom > box.bottom - FADE_BELOW) return item.bottom - (box.bottom - FADE_BELOW);
    if (item.top < box.top + FADE_ABOVE) return item.top - (box.top + FADE_ABOVE);
    return 0;
}
