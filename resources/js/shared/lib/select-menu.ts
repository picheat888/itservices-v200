// SearchableSelect menu: room for the reload status from the start, and no on-screen keyboard on touch screens until the search box is tapped.

export const RELOAD_MENU_MIN_PX = 288;

/** The menu's minimum width: the trigger's, or RELOAD_MENU_MIN_PX for a list that shows reload states. */
export function menuMinWidth(triggerWidth: number, reloading: boolean): number {
    return reloading ? Math.max(triggerWidth, RELOAD_MENU_MIN_PX) : triggerWidth;
}

/** Whether the search box takes focus on open; on a touch screen it never does, so the keyboard stays down until the search box is tapped. */
export function searchGetsFocus(s: { coarsePointer: boolean; isAsync: boolean; optionCount: number }): boolean {
    return !s.coarsePointer;
}
