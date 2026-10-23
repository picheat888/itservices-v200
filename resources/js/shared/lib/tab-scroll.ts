// Sideways tab bar scrolling: which ends still hide tabs, how far a page moves, and how far to scroll so the active tab shows.

/** Width (px) of each end's fade and its ‹ › button. */
export const TAB_FADE = 56;

export interface SideEdges {
    before: boolean;
    after: boolean;
}

export function sideEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): SideEdges {
    return { before: scrollLeft > 1, after: scrollLeft + clientWidth < scrollWidth - 1 };
}

/** One page of scrolling: the visible width less both fades, never under 120 px. */
export function tabPage(clientWidth: number): number {
    return Math.max(120, clientWidth - TAB_FADE * 2);
}

/** Pixels to scroll so a tab clears the fades (0 when it already shows); an end with nothing hidden has no fade. */
export function revealTab(tab: { left: number; right: number }, box: { left: number; right: number }, edges: SideEdges): number {
    const leftLimit = box.left + (edges.before ? TAB_FADE : 0);
    const rightLimit = box.right - (edges.after ? TAB_FADE : 0);
    if (tab.right > rightLimit) return tab.right - rightLimit;
    if (tab.left < leftLimit) return tab.left - leftLimit;
    return 0;
}
