/**
 * One short line saying which slice of a report a file or a schedule holds — "ก.ย. 2026,
 * กรอง 2 อย่าง, 5 คอลัมน์" — built from the filters it was made with. Used by the Report
 * Center rail (my-exports.tsx) so two files of the same report can be told apart — plus
 * `periodRange`, the dates of the hub's period switch for its report links. Dates are
 * written short, as the design does ("ส.ค. 2026"): a whole calendar month by its name, any
 * other range as "1 ก.ค. – 25 ก.ย. 2026". Gregorian years in both languages, like the rest
 * of the app's dates.
 */
import { formatRangeShort } from '@/shared/lib/datetime';

type Translate = (key: string) => string;

const DATE_KEYS = new Set(['from', 'to', 'as_of']);

/** View settings saved with a file (ReportFilter::viewOnly — what a table groups by): no filter to count. */
const VIEW_KEYS = new Set(['by']);

const isSet = (value: unknown) => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);

/** "YYYY-MM-DD" as a local date (no timezone shift). */
function parse(value: string): Date | null {
    const [y, m, d] = value.split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
}

function locale(lang: string): string {
    return lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB';
}

const format = (date: Date, lang: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale(lang), options).format(date);

/** The shared short range ("1 ก.ค. – 25 ก.ย. 2026"), kept under its report name for the report's callers. */
export function compactRange(fromValue: string, toValue: string, lang: string): string {
    return formatRangeShort(fromValue, toValue, lang);
}

export function reportScope(filters: Record<string, unknown>, columnsCount: number | null, t: Translate, lang: string): string {
    const parts: string[] = [];
    if (typeof filters.from === 'string' && typeof filters.to === 'string') {
        parts.push(compactRange(filters.from, filters.to, lang));
    } else if (typeof filters.as_of === 'string') {
        const asOf = parse(filters.as_of);
        parts.push(
            t('rep_scope_as_of').replace('{date}', asOf ? format(asOf, lang, { day: 'numeric', month: 'short', year: 'numeric' }) : filters.as_of),
        );
    }

    const narrowed = Object.entries(filters).filter(([key, value]) => !DATE_KEYS.has(key) && !VIEW_KEYS.has(key) && isSet(value)).length;
    if (narrowed > 0) parts.push(t('rep_scope_filters').replace('{n}', String(narrowed)));
    if (columnsCount) parts.push(t('rep_scope_columns').replace('{n}', String(columnsCount)));

    return parts.length > 0 ? parts.join(', ') : t('rep_scope_all');
}

/** Days each preset period looks back over, today included — ReportSnapshotService::PRESET_DAYS. */
const PRESET_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

/** A local date as "YYYY-MM-DD". */
export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The dates a Report Center period covers, worked out as ReportSnapshotService::range does:
 * a preset counts back from today (7 days = today and the six before it); custom is the
 * reader's own from / to. Local dates, so a link from the hub opens a report on the very days
 * its tiles count.
 */
export function periodRange(
    range: { period: '7d' | '30d' | '90d' } | { period: 'custom'; from: string; to: string },
    today = new Date(),
): { from: string; to: string } {
    if (range.period === 'custom') return { from: range.from, to: range.to };
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (PRESET_DAYS[range.period] - 1));

    return { from: isoDate(start), to: isoDate(today) };
}
