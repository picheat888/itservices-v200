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
