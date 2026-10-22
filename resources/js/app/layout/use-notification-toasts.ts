import { useAuth } from '@/modules/auth';
import type { AppNotification } from '@/modules/notification';
import {
    AWAY_MS,
    catchUpSince,
    claimRing,
    enteredBellIds,
    playNotificationSound,
    shouldRingInPage,
    summaryLines,
    unlockSoundOnFirstGesture,
    useFetchNotificationsSince,
    useMarkRead,
    useNotifications,
    useNotificationText,
} from '@/modules/notification';
import { REPORT_EXPORTS_KEY, REPORT_SCHEDULES_KEY } from '@/modules/report';
import { useSettings } from '@/modules/settings';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { SIDEBAR_BADGES_KEY } from '@/shared/hooks/use-sidebar-badges';
import { useToastStore, type ToastTone } from '@/stores/toast';
import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    iconMeta,
    notificationMessage,
    notificationTarget,
    notificationTitle,
    openNotificationTarget,
    type NotificationTone,
} from './notification-display';

/** Asset lists refreshed the moment an asset notification arrives, in step with the toast. */
const ASSET_QUERY_KEYS = [['assets-mine'], ['assets-list'], SIDEBAR_BADGES_KEY, ['assets-summary']] as const;

/** Long enough to read a title and a line of detail; the bell keeps every one, so none waits like an error. */
const NOTIFICATION_LIFE_MS = 6000;

/** The tone follows the notification's own badge colour from the bell's icon meta. */
function toneFor(tone: NotificationTone): ToastTone {
    if (tone === 'red') return 'error';
    if (tone === 'amber') return 'warning';
    if (tone === 'emerald') return 'success';
    return 'info';
}

interface BellSound {
    key: string;
    enabled: boolean;
}

// Per-device storage; private mode can throw on any access
function deviceStorage(): Storage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function readItem(key: string): string | null {
    try {
        return deviceStorage()?.getItem(key) ?? null;
    } catch {
        return null;
    }
}

function writeItem(key: string, value: string): void {
    try {
        deviceStorage()?.setItem(key, value);
    } catch {
        // Nothing to keep on this device
    }
}

function readLastSeen(userId: number): number | null {
    const raw = readItem(`itsd.lastSeenAt.${userId}`);
    const at = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(at) ? at : null;
}

function pushOnHere(userId: number): boolean {
    if (typeof Notification === 'undefined') return false;
    return readItem(`itsd.push.wanted.${userId}`) === '1' && Notification.permission === 'granted';
}

function tabVisible(): boolean {
    return document.visibilityState === 'visible';
}

function localDay(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Plays the bell sound once per ring id, in whichever open window claims it first. */
function ring(ringId: string, userId: number | null, sound: BellSound): void {
    if (userId === null || !sound.enabled) return;
    if (readItem(`itsd.sound.${userId}`) === 'off') return;
    if (!shouldRingInPage(tabVisible(), pushOnHere(userId))) return;
    const store = deviceStorage();
    if (store && !claimRing(ringId, store, Date.now())) return;
    playNotificationSound(sound.key);
}

/** Pops a toast for each new unread notification this session, through the app's one toast queue. Call once in the app shell. */
export function useNotificationToasts(openChangePassword: () => void): void {
    // Prefers the wording an administrator set on the Bell tab; falls through to the
    // bundled string for every other key, so this still serves the surrounding UI text.
    const t = useNotificationText();
    const fmtN = useNumberFormat();
    const navigate = useNavigate();
    const location = useLocation();
    const markRead = useMarkRead();
    const { data, dataUpdatedAt } = useNotifications();
    const fetchSince = useFetchNotificationsSince();
    const { user } = useAuth();
    const { data: settings } = useSettings();
    const qc = useQueryClient();
    // Ids already reacted to, seeded from the first fetch so nothing pops on page load
    const seen = useRef<Set<string> | null>(null);

    // Newest server timestamp seen at start: older rows pulled into the capped window are backlog, not news (null = tray was empty)
    const watermark = useRef<string | null>(null);

    // A catch-up summary is being fetched; arrivals meanwhile land in it instead of toasting
    const catchingUp = useRef(false);

    // Read at click time through refs, so a toast that outlives a re-render uses the current router
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;
    const searchRef = useRef(location.search);
    searchRef.current = location.search;
    const pathnameRef = useRef(location.pathname);
    pathnameRef.current = location.pathname;
    const openChangePasswordRef = useRef(openChangePassword);
    openChangePasswordRef.current = openChangePassword;
    const markReadRef = useRef(markRead);
    markReadRef.current = markRead;
    const tRef = useRef(t);
    tRef.current = t;
    const fmtNRef = useRef(fmtN);
    fmtNRef.current = fmtN;
    const fetchSinceRef = useRef(fetchSince);
    fetchSinceRef.current = fetchSince;
    const userIdRef = useRef<number | null>(user?.id ?? null);
    userIdRef.current = user?.id ?? null;
    const soundRef = useRef<BellSound>({ key: 'pluck', enabled: true });
    soundRef.current = {
        key: settings?.notification_sound ?? 'pluck',
        enabled: settings?.notification_sound_enabled !== '0',
    };

    // Catch-up summary: one toast and one sound for what arrived while the reader was away
    const catchUpRef = useRef<(now: number) => void>(() => undefined);
    catchUpRef.current = (now: number) => {
        const userId = userIdRef.current;
        if (userId === null || seen.current === null || catchingUp.current || !tabVisible()) return;
        const lastSeenAt = readLastSeen(userId);
        const since = catchUpSince(lastSeenAt, now);
        if (since === null) return;

        catchingUp.current = true;
        fetchSinceRef
            .current(since)
            .then((response) => {
                // The batch is summed up, so none of it toasts singly afterwards
                response.data.forEach((n) => seen.current?.add(n.id));
                const lines = summaryLines(response.unread_since ?? 0, response.unread);
                if (!lines) return;

                const tr = tRef.current;
                const fmt = fmtNRef.current;
                useToastStore
                    .getState()
                    .push(
                        lines.showTotal
                            ? tr('notification_summary_total').replaceAll('{total}', fmt(lines.unreadTotal))
                            : tr('notification_summary_open'),
                        'info',
                        tr('notification_summary_new').replaceAll('{n}', fmt(lines.newCount)),
                        undefined,
                        {
                            key: 'notification:summary',
                            duration: NOTIFICATION_LIFE_MS,
                            Icon: Bell,
                            onActivate: () => {
                                const params = new URLSearchParams(searchRef.current);
                                params.set('bell', '1');
                                navigateRef.current({ pathname: pathnameRef.current, search: `?${params}` }, { replace: true });
                            },
                        },
                    );
                ring(`summary:${lastSeenAt ?? localDay(now)}`, userId, soundRef.current);
            })
            .catch(() => undefined)
            .finally(() => {
                catchingUp.current = false;
            });
    };

    // Each bell rings as its toast enters the screen, so a burst rings once per toast as the queue lets them in
    useEffect(
        () =>
            useToastStore.subscribe((state, previous) => {
                enteredBellIds(previous.toasts, state.toasts).forEach((id) => ring(id, userIdRef.current, soundRef.current));
            }),
        [],
    );

    useEffect(() => {
        unlockSoundOnFirstGesture();
        const onVisibilityChange = () => {
            if (tabVisible()) catchUpRef.current(Date.now());
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    useEffect(() => {
        // Seed only from a successful fetch, or every unread row would look new
        if (!data) return;
        const items = data.data ?? [];
        const now = Date.now();
        const userId = userIdRef.current;
        // Read before this poll moves it forward
        const lastSeenAt = userId === null ? null : readLastSeen(userId);

        const handleArrivals = () => {
            if (seen.current === null) {
                seen.current = new Set(items.map((n) => n.id));
                watermark.current = items.reduce<string | null>(
                    (newest, n) => (n.created_at_iso && (newest === null || n.created_at_iso > newest) ? n.created_at_iso : newest),
                    null,
                );
                catchUpRef.current(now);
                return;
            }

            const unseen = items.filter((n) => !n.read && !seen.current!.has(n.id));
            if (unseen.length === 0) return;

            // Mark all seen, including backlog rows that will not toast
            unseen.forEach((n) => seen.current!.add(n.id));

            // Toast only rows created after watching began; a row without a timestamp counts as backlog
            const fresh = unseen.filter((n) => watermark.current === null || (n.created_at_iso != null && n.created_at_iso > watermark.current));
            if (fresh.length === 0) return;

            // Asset hand-over / return alerts: refresh the asset lists alongside the toast
            if (fresh.some((n) => n.data.type?.startsWith('asset'))) {
                ASSET_QUERY_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
            }
            // A report file finished (or failed) — the exports list on the Report Center shows it now.
            if (fresh.some((n) => n.data.type === 'report_export')) {
                qc.invalidateQueries({ queryKey: REPORT_EXPORTS_KEY });
            }
            if (fresh.some((n) => n.data.type === 'report_schedule')) {
                qc.invalidateQueries({ queryKey: REPORT_SCHEDULES_KEY });
            }

            // Out of reach for 30+ minutes (hidden, or polls failing, or asleep): these wait for the summary
            if (lastSeenAt !== null && now - lastSeenAt >= AWAY_MS) {
                if (tabVisible()) catchUpRef.current(now);
                return;
            }
            if (catchingUp.current) return;

            // Oldest first, so a burst enters in the order it happened
            [...fresh].reverse().forEach((n: AppNotification) => {
                const { Icon, tone } = iconMeta(n);
                const target = notificationTarget(n);

                useToastStore.getState().push(notificationMessage(n, tRef.current), toneFor(tone), notificationTitle(n, tRef.current), undefined, {
                    // By id, not text: two alerts can read alike without being the same alert
                    key: `notification:${n.id}`,
                    duration: NOTIFICATION_LIFE_MS,
                    group: target,
                    Icon,
                    onActivate: () => {
                        if (!n.read) markReadRef.current.mutate(n.id);
                        // As in the tray, the password warning opens a dialog rather than a page
                        if (n.data.type === 'password_expiring') {
                            openChangePasswordRef.current();
                        } else {
                            openNotificationTarget(navigateRef.current, n, searchRef.current);
                        }
                    },
                });
            });
        };

        handleArrivals();
        // Every successful poll while the page is in view counts as the reader having looked
        if (userId !== null && tabVisible()) writeItem(`itsd.lastSeenAt.${userId}`, String(now));
    }, [data, dataUpdatedAt, qc]);
}
