import { useT } from '@/lang';
import type { AppNotification } from '@/modules/notification';
import { useMarkRead, useNotifications } from '@/modules/notification';
import { useToastStore, type ToastTone } from '@/stores/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { iconMeta, notificationMessage, notificationTarget, notificationTitle } from './notification-display';

/** Asset query keys refreshed the instant an asset notification arrives, so the
 *  My Assets list (and the admin lists) update in step with the toast rather than
 *  lagging behind on their own separate poll cycle. */
const ASSET_QUERY_KEYS = [['assets-mine'], ['assets-list'], ['assets-pending-return'], ['assets-summary']] as const;

/**
 * Notification toasts live as long as the old dedicated toaster gave them: long
 * enough to read a title, a line of detail, and decide whether to tap through.
 * They never sit and wait like an error does — the bell keeps every one of them,
 * so a toast that slips past costs nothing.
 */
const NOTIFICATION_LIFE_MS = 6000;

/**
 * The badge colour is the notification's own (a breached SLA is red wherever it
 * appears), so the tone is read back off the icon meta the bell already uses
 * rather than invented here.
 */
function toneFor(color: string): ToastTone {
    if (color.includes('red')) return 'error';
    if (color.includes('amber')) return 'warning';
    if (color.includes('emerald')) return 'success';
    return 'info';
}

/**
 * Pops a toast whenever a new unread notification arrives during this session
 * (detected from the polling useNotifications query). Call once, inside the app
 * shell — it renders nothing; the toasts go into the app's one toast queue so
 * they share the corner, the three-at-once limit and the countdown behaviour
 * with every other toast instead of stacking a second region on top.
 */
export function useNotificationToasts(): void {
    const t = useT();
    const navigate = useNavigate();
    const markRead = useMarkRead();
    const { data } = useNotifications();
    const qc = useQueryClient();
    // Ids we've already reacted to. Seeded from the first fetch so pre-existing
    // notifications never pop on page load — only genuinely new ones do.
    const seen = useRef<Set<string> | null>(null);

    // The toast callbacks below are created once per arrival but read at click time,
    // so they go through refs — otherwise a toast that outlives a re-render would
    // navigate with a stale router.
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;
    const markReadRef = useRef(markRead);
    markReadRef.current = markRead;
    const tRef = useRef(t);
    tRef.current = t;

    useEffect(() => {
        // Wait for the first *successful* fetch before seeding. Seeding on the initial
        // undefined (query still loading) would seed an empty set, and the real payload
        // arriving next would then look entirely "new" — popping a toast for every
        // unread notification on each page reload.
        if (!data) return;
        const items = data.data ?? [];

        if (seen.current === null) {
            seen.current = new Set(items.map((n) => n.id));
            return;
        }

        const fresh = items.filter((n) => !n.read && !seen.current!.has(n.id));
        if (fresh.length === 0) return;

        fresh.forEach((n) => seen.current!.add(n.id));

        // Oldest first, so a burst reads in the order it happened as slots free up.
        [...fresh].reverse().forEach((n: AppNotification) => {
            const { Icon, color } = iconMeta(n);
            const target = notificationTarget(n);

            useToastStore.getState().push(notificationMessage(n, tRef.current), toneFor(color), notificationTitle(n), undefined, {
                // The notification id, not the text: two alerts can read alike without
                // being the same alert, and the burst guard must not swallow one.
                key: `notification:${n.id}`,
                duration: NOTIFICATION_LIFE_MS,
                group: target,
                Icon,
                onActivate: () => {
                    if (!n.read) markReadRef.current.mutate(n.id);
                    navigateRef.current(target);
                },
            });
        });

        // A fresh asset hand-over / return alert means the asset lists just changed —
        // refresh them now so they update alongside the toast, not on their own poll.
        if (fresh.some((n) => n.data.type?.startsWith('asset'))) {
            ASSET_QUERY_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
        }
    }, [data, qc]);
}
