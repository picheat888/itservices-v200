/**
 * The report module's chart palette — one ChartTone, three uses — shared by the tabular charts
 * (tabular-charts.tsx) and the summary tiles (summary-strip.tsx), so a status or a source wears
 * the same colour in a tile's meter as in the chart beside it.
 */
import type { ChartTone } from '../types';

/** Each tone as a fill (bars, swatches) and as a stroke (donut arcs). */
export const FILL: Record<ChartTone, string> = {
    green: 'bg-emerald-500',
    blue: 'bg-blue-500',
    violet: 'bg-violet-500',
    orange: 'bg-orange-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    gray: 'bg-slate-400 dark:bg-slate-500',
};
/** Each tone as text, for the counts printed over a stacked bar. */
export const TEXT: Record<ChartTone, string> = {
    green: 'text-emerald-600 dark:text-emerald-400',
    blue: 'text-blue-600 dark:text-blue-400',
    violet: 'text-violet-600 dark:text-violet-400',
    orange: 'text-orange-600 dark:text-orange-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    gray: 'text-slate-500 dark:text-slate-400',
};
export const STROKE: Record<ChartTone, string> = {
    green: 'stroke-emerald-500',
    blue: 'stroke-blue-500',
    violet: 'stroke-violet-500',
    orange: 'stroke-orange-500',
    amber: 'stroke-amber-500',
    red: 'stroke-red-500',
    gray: 'stroke-slate-400 dark:stroke-slate-500',
};
