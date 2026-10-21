// SearchableSelect menu: room for the reload status from the start, and no on-screen keyboard for short lists on touch screens.

export const RELOAD_MENU_MIN_PX = 288;

export const SHORT_LIST_MAX = 8;

/** The menu's minimum width: the trigger's, or RELOAD_MENU_MIN_PX for a list that shows reload states. */
export function menuMinWidth(triggerWidth: number, reloading: boolean): number {
    return reloading ? Math.max(triggerWidth, RELOAD_MENU_MIN_PX) : triggerWidth;
}

/** Whether the search box takes focus on open; a short list on a touch screen leaves it alone so the keyboard stays down. */
export function searchGetsFocus(s: { coarsePointer: boolean; isAsync: boolean; optionCount: number }): boolean {
    return !s.coarsePointer || s.isAsync || s.optionCount > SHORT_LIST_MAX;
}
