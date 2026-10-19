// The Overview period as plain functions (no React): which period a URL means, the API params for it, and the custom-range limit.
export type OverviewPeriod = number | 'all' | 'year' | { from: string; to: string };

/** Per-module choices: which buttons show, the period the URL falls back to, and the longest custom range. */
export type PeriodOptions = { allowAll?: boolean; year?: boolean; fallback?: OverviewPeriod; maxDays?: number };

export const PRESETS = [7, 30, 90] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Days from `from` to `to`, counting both ends. */
export const spanDays = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;

/** The period from the URL values; anything unknown (or a custom range over the limit) is the fallback, all time by default. */
export function readOverviewPeriod(range: string, from: string, to: string, options?: PeriodOptions): OverviewPeriod {
    const fallback = options?.fallback ?? 'all';
    if (range === 'custom') {
        const valid = ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to;
        return valid && (options?.maxDays == null || spanDays(from, to) <= options.maxDays) ? { from, to } : fallback;
    }
    if (range === 'year' && options?.year) return 'year';
    const days = Number(range);
    return (PRESETS as readonly number[]).includes(days) ? days : fallback;
}

/** API query params for a period: ?days=7|30|90|year|all or ?from&to. */
export function overviewPeriodParams(period: OverviewPeriod): Record<string, string | number> {
    return typeof period === 'object' ? { from: period.from, to: period.to } : { days: period };
}

/** Whether the period runs up to today, so its last chart column is the one still being lived through. */
export function periodReachesToday(period: OverviewPeriod, today = new Date()): boolean {
    if (typeof period !== 'object') return true;
    const pad = (n: number) => String(n).padStart(2, '0');
    return period.to >= `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

/** A stable query-key part for a period. */
export const overviewPeriodKey = (period: OverviewPeriod) => (typeof period === 'object' ? `${period.from}_${period.to}` : String(period));

/** Which words name a period on a KPI card footer: the lang key, and the day count for a preset. */
export function periodWordKey(period: OverviewPeriod, form: 'within' | 'recent' | 'versus'): { key: string; days?: number } {
    if (typeof period === 'number') {
        const key = form === 'within' ? 'period_within_days' : form === 'recent' ? 'period_recent_days' : 'period_versus_days';
        return { key, days: period };
    }
    if (form === 'versus') return { key: 'period_versus_previous' };
    return { key: period === 'year' ? 'period_within_year' : period === 'all' ? 'period_since_start' : 'period_within_range' };
}
