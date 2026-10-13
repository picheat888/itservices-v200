// Display text for dates and times, from the Settings → System date format (date_format, date_era, time_format).
// Pure and dependency-free so Node can test it; App\Support\DateDisplay mirrors it via tests/Fixtures/date-format-cases.json.
import names from './date-names.json' with { type: 'json' };

export type DateFormat = 'dmy_slash' | 'dmy_dash' | 'ymd_slash' | 'ymd_dash' | 'd_mon_y' | 'd_month_y';
export type DateEra = 'ce' | 'be';
export type TimeFormat = '24' | '12';
export interface DateConfig {
    format: DateFormat;
    era: DateEra;
    time: TimeFormat;
}
export type DateValue = string | Date | null | undefined;

export const DATE_FORMATS: readonly DateFormat[] = ['dmy_slash', 'dmy_dash', 'ymd_slash', 'ymd_dash', 'd_mon_y', 'd_month_y'];
const ERAS: readonly DateEra[] = ['ce', 'be'];
const TIMES: readonly TimeFormat[] = ['24', '12'];
export const DEFAULT_DATE_CONFIG: DateConfig = { format: 'dmy_slash', era: 'ce', time: '24' };

export const EMPTY_DATE = '—';
const EMPTY = EMPTY_DATE;
// YYYY-MM, YYYY-MM-DD, then an optional " HH:mm[:ss[.ffffff]]" or "THH:mm…" and an optional zone, which is ignored.
const WALL = /^(\d{4})-(\d{2})(?:-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(?:[zZ]|[+-]\d{2}:?\d{2})?)?$/;

interface Parts {
    y: number;
    m: number;
    d: number | null;
    h: number | null;
    i: number | null;
}

export interface DateFormatter {
    date(value: DateValue): string;
    dateTime(value: DateValue): string;
    time(value: DateValue): string;
    monthYear(value: DateValue): string;
    monthYearLong(value: DateValue): string;
    month(value: DateValue): string;
    dayMonth(value: DateValue): string;
    range(from: DateValue, to: DateValue): string;
    year(year: number): string;
}

type LooseConfig = Partial<Record<keyof DateConfig, unknown>> | null | undefined;

export function normalizeDateConfig(config: LooseConfig): DateConfig {
    const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
        allowed.includes(String(value) as T) ? (String(value) as T) : fallback;
    return {
        format: pick(config?.format, DATE_FORMATS, DEFAULT_DATE_CONFIG.format),
        era: pick(config?.era, ERAS, DEFAULT_DATE_CONFIG.era),
        time: pick(config?.time, TIMES, DEFAULT_DATE_CONFIG.time),
    };
}

export const sameDateConfig = (a: DateConfig, b: DateConfig) => a.format === b.format && a.era === b.era && a.time === b.time;

/** A whole date or date-time value (as the API sends them), not merely text containing digits. */
export function isDateString(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const p = parse(value);
    return p !== null && p.d !== null;
}

/**
 * A stored value (audit log diffs) as text: a zoned instant ("…Z", as Laravel serialises a cast date)
 * is read in local time, and a value at midnight is a date, so it gets no time.
 */
export function storedDateText(value: string, fmt: DateFormatter): string {
    const at: DateValue = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value.trim()) ? new Date(value) : value;
    const p = parse(at);
    if (!p) return value;
    return (p.h ?? 0) === 0 && (p.i ?? 0) === 0 ? fmt.date(at) : fmt.dateTime(at);
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

function parse(value: DateValue): Parts | null {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate(), h: value.getHours(), i: value.getMinutes() };
    }
    if (!value) return null;
    const match = WALL.exec(value.trim());
    if (!match) return null;
    const [, y, m, d, h, i] = match;
    const parts: Parts = { y: +y, m: +m, d: d ? +d : null, h: h ? +h : null, i: i ? +i : null };
    if (parts.m < 1 || parts.m > 12) return null;
    if (parts.d !== null && (parts.d < 1 || parts.d > lastDay(parts.y, parts.m))) return null;
    if (parts.h !== null && (parts.h > 23 || (parts.i ?? 0) > 59)) return null;
    return parts;
}

export function bindDateFormat(config: LooseConfig, lang: string): DateFormatter {
    const c = normalizeDateConfig(config);
    const months = lang === 'th' ? names.th : names.en;
    const year = (y: number) => String(c.era === 'be' ? y + 543 : y);

    // Formatters over already-parsed parts, so each public call parses its value once.
    const datePart = (p: Parts & { d: number }) => {
        const d = pad(p.d);
        const m = pad(p.m);
        const y = year(p.y);
        switch (c.format) {
            case 'dmy_dash':
                return `${d}-${m}-${y}`;
            case 'ymd_slash':
                return `${y}/${m}/${d}`;
            case 'ymd_dash':
                return `${y}-${m}-${d}`;
            case 'd_mon_y':
                return `${d} ${months.short[p.m - 1]} ${y}`;
            case 'd_month_y':
                return `${d} ${months.long[p.m - 1]} ${y}`;
            default:
                return `${d}/${m}/${y}`;
        }
    };
    const timePart = (h: number, i: number) =>
        c.time === '12' ? `${h % 12 || 12}:${pad(i)} ${h < 12 ? names.am : names.pm}` : `${pad(h)}:${pad(i)}`;
    const monthYearPart = (p: Parts) => `${months.short[p.m - 1]} ${year(p.y)}`;
    const dayMonthPart = (p: Parts & { d: number }) => `${pad(p.d)} ${months.short[p.m - 1]}`;
    const hasDay = (p: Parts | null): p is Parts & { d: number } => p !== null && p.d !== null;

    const date = (value: DateValue) => {
        const p = parse(value);
        return hasDay(p) ? datePart(p) : EMPTY;
    };

    const time = (value: DateValue) => {
        const p = parse(value);
        return p && p.h !== null && p.i !== null ? timePart(p.h, p.i) : EMPTY;
    };

    const dateTime = (value: DateValue) => {
        const p = parse(value);
        if (!hasDay(p)) return EMPTY;
        return p.h === null || p.i === null ? datePart(p) : `${datePart(p)} ${timePart(p.h, p.i)}`;
    };

    const month = (value: DateValue) => {
        const p = parse(value);
        return p ? months.short[p.m - 1] : EMPTY;
    };

    const monthYear = (value: DateValue) => {
        const p = parse(value);
        return p ? monthYearPart(p) : EMPTY;
    };

    const monthYearLong = (value: DateValue) => {
        const p = parse(value);
        return p ? `${months.long[p.m - 1]} ${year(p.y)}` : EMPTY;
    };

    const dayMonth = (value: DateValue) => {
        const p = parse(value);
        return hasDay(p) ? dayMonthPart(p) : EMPTY;
    };

    const range = (from: DateValue, to: DateValue) => {
        const f = parse(from);
        const t = parse(to);
        if (!hasDay(f) || !hasDay(t)) return EMPTY;
        if (f.y === t.y && f.m === t.m && f.d === 1 && t.d === lastDay(t.y, t.m)) return monthYearPart(f);
        if (f.y === t.y) return `${dayMonthPart(f)} – ${dayMonthPart(t)} ${year(t.y)}`;
        return `${dayMonthPart(f)} ${year(f.y)} – ${dayMonthPart(t)} ${year(t.y)}`;
    };

    return { date, dateTime, time, monthYear, monthYearLong, month, dayMonth, range, year };
}

/** Every month on a two-digit day plus the widest clock readings: what a date column must fit, whatever the rows hold. */
export function dateWidthSamples(config: LooseConfig, lang: string): { dates: string[]; times: string[] } {
    const fmt = bindDateFormat(config, lang);
    return {
        dates: Array.from({ length: 12 }, (_, i) => fmt.date(`2026-${pad(i + 1)}-28`)),
        times: ['12:59', '10:58', '23:59'].map((t) => fmt.time(`2026-01-01 ${t}`)),
    };
}

/** "5 hours ago" for lists that answer "is this in use", not "exactly when". */
export function relativeTime(iso: string | null, lang: string, neverLabel: string): string {
    if (!iso) return neverLabel;
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return lang === 'th' ? 'เมื่อสักครู่' : 'just now';
    if (mins < 60) return lang === 'th' ? `${mins} นาทีที่แล้ว` : `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return lang === 'th' ? `${hrs} ชั่วโมงที่แล้ว` : `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
    const days = Math.round(hrs / 24);
    return lang === 'th' ? `${days} วันที่แล้ว` : `${days} day${days > 1 ? 's' : ''} ago`;
}
