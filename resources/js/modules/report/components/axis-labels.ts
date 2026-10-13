// How often an SVG bar chart labels its bars so its axis labels never run into each other.

/** Rough advance of one character of the 10.5px monospaced axis text, in chart units. */
const CHAR_WIDTH = 6.4;
/** Breathing room between two neighbouring labels, in chart units. */
const GAP = 6;

/** Label every nth bar: the smallest n for which the longest label, plus a gap, fits n slots. */
export function labelStep(labels: string[], slot: number): number {
    if (labels.length === 0 || slot <= 0) return 1;
    const longest = Math.max(...labels.map((label) => label.length));
    return Math.max(1, Math.ceil((longest * CHAR_WIDTH + GAP) / slot));
}

/** Which of a chart's `bars + 1` bar edges carry a label: every `every`th, plus the range end, which wins over an edge too close to it. */
export function edgeTicks(bars: number, every: number): number[] {
    if (bars === 0) return [];
    if (bars < every) return [0];
    const ticks: number[] = [];
    for (let edge = 0; bars - edge >= every; edge += every) ticks.push(edge);
    return [...ticks, bars];
}
