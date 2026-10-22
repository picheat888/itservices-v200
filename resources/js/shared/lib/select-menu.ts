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

/** The first row at or after `from` (wrapping) that can be chosen; -1 when none can. */
export function firstEnabled(disabled: readonly boolean[], from: number): number {
    for (let k = 0; k < disabled.length; k++) {
        const i = (Math.max(0, from) + k) % disabled.length;
        if (!disabled[i]) return i;
    }
    return -1;
}

/** The row an arrow key moves to from `from`, skipping rows that cannot be chosen (wrapping); -1 when none can. */
export function stepActive(disabled: readonly boolean[], from: number, step: 1 | -1): number {
    const n = disabled.length;
    for (let k = 1; k <= n; k++) {
        const i = (((from + step * k) % n) + n) % n;
        if (!disabled[i]) return i;
    }
    return -1;
}
