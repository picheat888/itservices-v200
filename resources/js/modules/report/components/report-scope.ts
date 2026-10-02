/**
 * One short line saying which slice of a report a file or a schedule holds — "ก.ย. 2026 ·
 * กรอง 2 อย่าง · 5 คอลัมน์" — built from the filters it was made with. Used by the Report
 * Center rail (my-exports.tsx) so two files of the same report can be told apart — plus
 * `periodRange`, the dates of the hub's period switch for its report links. Dates are
 * written short, as the design does ("ส.ค. 2026"): a whole calendar month by its name, any
 * other range as "1 ก.ค. – 25 ก.ย. 2026". Gregorian years in both languages, like the rest
 * of the app's dates.
 */
type Translate = (key: string) => string;

const DATE_KEYS = new Set(['from', 'to', 'as_of']);

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

export function compactRange(fromValue: string, toValue: string, lang: string): string {
    const from = parse(fromValue);
    const to = parse(toValue);
    if (!from || !to) return `${fromValue} – ${toValue}`;

    const lastOfMonth = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
    const sameMonth = from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
    if (sameMonth && from.getDate() === 1 && to.getDate() === lastOfMonth) {
        return format(from, lang, { month: 'short', year: 'numeric' });
    }
    const sameYear = from.getFullYear() === to.getFullYear();
    const start = format(from, lang, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });

    return `${start} – ${format(to, lang, { day: 'numeric', month: 'short', year: 'numeric' })}`;
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

    const narrowed = Object.entries(filters).filter(([key, value]) => !DATE_KEYS.has(key) && isSet(value)).length;
    if (narrowed > 0) parts.push(t('rep_scope_filters').replace('{n}', String(narrowed)));
    if (columnsCount) parts.push(t('rep_scope_columns').replace('{n}', String(columnsCount)));

    return parts.length > 0 ? parts.join(' · ') : t('rep_scope_all');
}

/**
 * The dates a Report Center period covers, worked out as ReportSnapshotService::range does:
 * 7 days = today and the six before it; month / quarter / year = from its first day; all to
 * today. Local dates, so a link from the hub opens a report on the very days its tiles count.
 */
export function periodRange(period: '7d' | 'month' | 'quarter' | 'year', today = new Date()): { from: string; to: string } {
    const y = today.getFullYear();
    const m = today.getMonth();
    const start =
        period === '7d'
            ? new Date(y, m, today.getDate() - 6)
            : period === 'quarter'
              ? new Date(y, m - (m % 3), 1)
              : period === 'year'
                ? new Date(y, 0, 1)
                : new Date(y, m, 1);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    return { from: iso(start), to: iso(today) };
}
