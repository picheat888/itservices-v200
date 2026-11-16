// Where a floating panel on a page (not in a dialog) opens against its trigger: below, or above when it does not fit below.

/** A fixed panel's vertical spot in the window: `top` when it opens below, `bottom` when above; capped to that side's room. */
export type PanelSpot = { top: number; maxHeight: number } | { bottom: number; maxHeight: number };

/**
 * Below the trigger by default; above it when the panel's full height does not fit below and there is more room above.
 * Either way the panel is capped to the room on its side, so one taller than both sides scrolls its body.
 * `panelHeight` is null before the panel is drawn: it then starts below and is placed again once measured.
 * `gap` is the space between trigger and panel, `edge` the space kept from the window edge.
 */
export function pagePanelSpot(
    trigger: { top: number; bottom: number },
    windowHeight: number,
    panelHeight: number | null,
    gap = 4,
    edge = 8,
): PanelSpot {
    const top = trigger.bottom + gap;
    const below = windowHeight - top - edge;
    const above = trigger.top - gap - edge;
    const up = panelHeight !== null && panelHeight > below && above > below;
    return up ? { bottom: windowHeight - trigger.top + gap, maxHeight: above } : { top, maxHeight: below };
}
