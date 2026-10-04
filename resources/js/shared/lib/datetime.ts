/**
 * Formats backend timestamps for display. The whole stack runs on local wall time
 * (fixed by APP_TIMEZONE in .env — single-site deployment): the API emits either
 * naive local strings ("YYYY-MM-DD HH:mm:ss") or ISO strings carrying the app
 * offset ("…T10:00:00+07:00"). In both cases the wall-time portion is already the
 * display value, so this slices instead of converting — neither the browser's
 * timezone nor any setting plays a part. Returns "YYYY-MM-DD HH:mm" (or date only).
 */
export function formatDateTime(value: string | null | undefined, withTime = true): string {
    if (!value) return '—';
    // Drop a trailing zone designator; what remains is the local wall time.
    const wall = value.replace(/(?:[zZ]|[+-]\d\d:?\d\d)$/, '');
    const [datePart, timePart = ''] = wall.includes('T') ? wall.split('T') : wall.split(' ');
    if (!withTime || !timePart) return datePart;
    return `${datePart} ${timePart.slice(0, 5)}`;
}

/**
 * A date-only value ("2026-10-04") as people read it: "4 ต.ค. 2026" / "4 Oct 2026" — Gregorian
 * years in both languages, as the report headers write their ranges. Parsed as a LOCAL date so
 * the day never shifts; anything that is not YYYY-MM-DD comes back unchanged.
 */
export function formatDateShort(value: string, lang: string): string {
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return value;
    return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(y, m - 1, d),
    );
}

/**
 * A from/to pair of date-only values, written short: a whole calendar month by its name
 * ("ก.ย. 2026"), a range in one year with the year once ("1 ก.ย. – 6 ต.ค. 2026"), else both
 * years ("1 ธ.ค. 2025 – 31 ม.ค. 2026"). Gregorian years in both languages, like formatDateShort.
 */
export function formatRangeShort(fromValue: string, toValue: string, lang: string): string {
    const parse = (value: string) => {
        const [y, m, d] = value.split('-').map(Number);
        return y && m && d ? new Date(y, m - 1, d) : null;
    };
    const from = parse(fromValue);
    const to = parse(toValue);
    if (!from || !to) return `${fromValue} – ${toValue}`;

    const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', options).format(date);
    const lastOfMonth = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
    const sameMonth = from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
    if (sameMonth && from.getDate() === 1 && to.getDate() === lastOfMonth) {
        return format(from, { month: 'short', year: 'numeric' });
    }
    const sameYear = from.getFullYear() === to.getFullYear();
    const start = format(from, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });

    return `${start} – ${format(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/**
 * "5 hours ago" for a settings list — coarse on purpose: these columns answer "is this thing
 * actually in use", not "exactly when". Shared by the Email and Notification tabs so the two
 * halves of that page phrase the same fact the same way.
 */
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
