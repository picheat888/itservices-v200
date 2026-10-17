// Pure figures for the Dashboard tiles and charts: bar shares and a round chart axis (node tests).

export interface ShareInput {
    key: string;
    value: number;
    className: string;
    title?: string;
}

export interface SharePiece {
    key: string;
    percent: number;
    className: string;
    title?: string;
}

/** Each value as a percent of their sum, for KpiTile's `bar`; empty when the sum is 0. */
export function sharePieces(items: ShareInput[]): SharePiece[] {
    const total = items.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return [];

    return items
        .filter((item) => item.value > 0)
        .map((item) => ({
            key: item.key,
            percent: (item.value / total) * 100,
            className: item.className,
            ...(item.title ? { title: item.title } : {}),
        }));
}

/** The chart's top, a whole-number step of 1, 2 or 5 × 10ⁿ, and the guide lines from 0 up to it. */
export function niceAxis(max: number, lines = 4): { top: number; ticks: number[] } {
    const raw = max / lines;
    let step = 1;
    if (raw > 1) {
        const power = 10 ** Math.floor(Math.log10(raw));
        step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
    }

    return { top: step * lines, ticks: Array.from({ length: lines + 1 }, (_, i) => i * step) };
}
