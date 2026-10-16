// How an SVG bar chart sizes and spaces its axis labels so they never run into each other.

/** The axis text size, in chart units, and the smallest it may shrink to on a dense chart. */
export const AXIS_FONT = 10.5;
const MIN_AXIS_FONT = 8;
/** Rough advance of one character of the axis text, per unit of font size. */
const CHAR_PER_FONT = 6.4 / AXIS_FONT;
/** Breathing room between two neighbouring labels, in chart units. */
const GAP = 6;

const longest = (labels: string[]) => Math.max(...labels.map((label) => label.length));

/** The largest axis font, down to its floor, at which the longest label plus a gap fits one slot. */
export function fitAxisFont(labels: string[], slot: number): number {
    if (labels.length === 0 || slot <= 0) return AXIS_FONT;
    const fits = (slot - GAP) / (longest(labels) * CHAR_PER_FONT);
    return Math.min(AXIS_FONT, Math.max(MIN_AXIS_FONT, Math.floor(fits * 10) / 10));
}

/** Label every nth bar: the smallest n for which the longest label, plus a gap, fits n slots. */
export function labelStep(labels: string[], slot: number, fontSize: number = AXIS_FONT): number {
    if (labels.length === 0 || slot <= 0) return 1;
    return Math.max(1, Math.ceil((longest(labels) * CHAR_PER_FONT * fontSize + GAP) / slot));
}

const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** The days a weekly bar really counts — its Sunday-to-Saturday week (as the date pickers show it) cut by the range — and their short "17–20" label. */
export function weekDays(weekStart: string, from: string, to: string): { start: string; end: string; days: string } {
    const [y, m, d] = weekStart.split('-').map(Number);
    const saturday = isoDay(new Date(y, m - 1, d + 6));
    const start = weekStart < from ? from : weekStart;
    const end = saturday > to ? to : saturday;
    const day = (iso: string) => String(Number(iso.slice(8)));
    return { start, end, days: start === end ? day(start) : `${day(start)}–${day(end)}` };
}
