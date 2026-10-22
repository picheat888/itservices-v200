// When a page sums up the bells missed while away, when it rings for one, and how open windows share one ring.
// Pure (storage is passed in), so node tests import it with a relative path.

export const AWAY_MS = 30 * 60_000;
export const FIRST_OPEN_LOOKBACK_MS = 24 * 3_600_000;

const RING_PREFIX = 'itsd.rang.';
const RING_KEEP_MS = 3_600_000;

type RingStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function sameLocalDay(a: number, b: number): boolean {
    const x = new Date(a);
    const y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** Where a catch-up summary counts from, or null when the reader never really left. */
export function catchUpSince(lastSeenAt: number | null, now: number): number | null {
    if (lastSeenAt === null) return now - FIRST_OPEN_LOOKBACK_MS;
    if (!sameLocalDay(lastSeenAt, now) || now - lastSeenAt >= AWAY_MS) return lastSeenAt;
    return null;
}

/** The summary toast's figures, or null when nothing arrived (no toast, no sound). */
export function summaryLines(newCount: number, unreadTotal: number): { newCount: number; unreadTotal: number; showTotal: boolean } | null {
    if (newCount === 0) return null;
    return { newCount, unreadTotal, showTotal: unreadTotal > newCount };
}

/** A hidden tab leaves the ringing to this device's push notification when it has one. */
export function shouldRingInPage(tabVisible: boolean, pushOn: boolean): boolean {
    return tabVisible || !pushOn;
}

/** True for the first window to claim this ring; also drops claims older than an hour. A storage that throws rings anyway. */
export function claimRing(id: string, store: RingStore, now: number): boolean {
    try {
        const key = RING_PREFIX + id;
        if (store.getItem(key) !== null) return false;

        const stale: string[] = [];
        for (let i = 0; i < store.length; i++) {
            const k = store.key(i);
            if (k === null || !k.startsWith(RING_PREFIX)) continue;
            const at = Number(store.getItem(k));
            if (!Number.isFinite(at) || now - at > RING_KEEP_MS) stale.push(k);
        }
        stale.forEach((k) => store.removeItem(k));

        store.setItem(key, String(now));
        return true;
    } catch {
        return true;
    }
}

const BELL_TOAST_PREFIX = 'notification:';
const SUMMARY_TOAST_KEY = 'notification:summary';

interface ShownToast {
    id: number;
    key: string;
    shownAt: number | null;
}

/** Notification ids whose toast entered the screen between two toast-queue states; each one rings then. */
export function enteredBellIds(prev: readonly ShownToast[], next: readonly ShownToast[]): string[] {
    const wasShown = new Set(prev.filter((t) => t.shownAt !== null).map((t) => t.id));
    return next
        .filter((t) => t.shownAt !== null && !wasShown.has(t.id) && t.key.startsWith(BELL_TOAST_PREFIX) && t.key !== SUMMARY_TOAST_KEY)
        .map((t) => t.key.slice(BELL_TOAST_PREFIX.length));
}
