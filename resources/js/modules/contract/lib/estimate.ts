// Rough whole-contract total for the form: value per billing cycle × cycles from start through the end date (end-inclusive, as Contract::durationMonths()).
import type { BillingCycle } from '../../../shared/types/index.ts';

const parse = (iso: string): { y: number; m: number; d: number } | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return match ? { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) } : null;
};

/** Whole months from start to the day after end, so 1 Jan → 31 Dec is 12. */
export function termMonths(start: string, end: string): number | null {
    const s = parse(start);
    const e = parse(end);
    if (!s || !e) return null;
    const after = new Date(Date.UTC(e.y, e.m - 1, e.d + 1));
    const months = (after.getUTCFullYear() - s.y) * 12 + (after.getUTCMonth() + 1 - s.m) + (after.getUTCDate() >= s.d ? 0 : -1);
    return months < 0 ? null : months;
}

export function contractTotalEstimate(value: number, start: string, end: string, cycle: BillingCycle): number | null {
    if (!value || !start || !end || end < start) return null;
    const months = termMonths(start, end);
    if (months === null) return null;
    const cycles = cycle === 'monthly' ? months : cycle === 'quarterly' ? months / 3 : months / 12;
    return Math.round(value * Math.max(1, Math.round(cycles)) * 100) / 100;
}
