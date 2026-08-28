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
