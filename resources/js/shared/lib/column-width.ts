// Table column widths that narrow with the screen, so a wide table fits a smaller screen by cutting its text instead of hiding its last columns.

/**
 * A CSS width that is `full` px on screens at least `from` px wide and narrows in step with the
 * screen to `min` px at `to` px; below `to` it stays at `min` and the table scrolls sideways.
 * Give it to columns whose text is cut with TruncText, so the cut text can still be read in full.
 */
export function narrowingWidth(full: number, min: number, from: number, to: number): string {
    const perPx = Math.round(((full - min) / (from - to)) * 10000) / 10000;
    return `clamp(${min}px, calc(${full}px - (${from}px - 100vw) * ${perPx}), ${full}px)`;
}
