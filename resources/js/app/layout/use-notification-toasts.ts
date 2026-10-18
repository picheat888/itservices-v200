import type { AppNotification } from '@/modules/notification';
import { useMarkRead, useNotifications, useNotificationText } from '@/modules/notification';
import { REPORT_EXPORTS_KEY, REPORT_SCHEDULES_KEY } from '@/modules/report';
import { SIDEBAR_BADGES_KEY } from '@/shared/hooks/use-sidebar-badges';
import { useToastStore, type ToastTone } from '@/stores/toast';
import { useQueryClient } from '@tanstack/react-query';
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

/** Pops a toast for each new unread notification this session, through the app's one toast queue. Call once in the app shell. */
export function useNotificationToasts(openChangePassword: () => void): void {
    // Prefers the wording an administrator set on the Bell tab; falls through to the
    // bundled string for every other key, so this still serves the surrounding UI text.
    const t = useNotificationText();
    const navigate = useNavigate();
    const location = useLocation();
    const markRead = useMarkRead();
    const { data } = useNotifications();
    const qc = useQueryClient();
    // Ids already reacted to, seeded from the first fetch so nothing pops on page load
    const seen = useRef<Set<string> | null>(null);

    // Newest server timestamp seen at start: older rows pulled into the capped window are backlog, not news (null = tray was empty)
    const watermark = useRef<string | null>(null);

    // Read at click time through refs, so a toast that outlives a re-render uses the current router
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;
    const searchRef = useRef(location.search);
    searchRef.current = location.search;
    const openChangePasswordRef = useRef(openChangePassword);
    openChangePasswordRef.current = openChangePassword;
    const markReadRef = useRef(markRead);
    markReadRef.current = markRead;
    const tRef = useRef(t);
    tRef.current = t;

    useEffect(() => {
        // Seed only from a successful fetch, or every unread row would look new
        if (!data) return;
        const items = data.data ?? [];

        if (seen.current === null) {
            seen.current = new Set(items.map((n) => n.id));
            watermark.current = items.reduce<string | null>(
                (newest, n) => (n.created_at_iso && (newest === null || n.created_at_iso > newest) ? n.created_at_iso : newest),
                null,
            );
            return;
        }

        const unseen = items.filter((n) => !n.read && !seen.current!.has(n.id));
        if (unseen.length === 0) return;

        // Mark all seen, including backlog rows that will not toast
        unseen.forEach((n) => seen.current!.add(n.id));

        // Toast only rows created after watching began; a row without a timestamp counts as backlog
        const fresh = unseen.filter((n) => watermark.current === null || (n.created_at_iso != null && n.created_at_iso > watermark.current));
        if (fresh.length === 0) return;

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
    }, [data, qc]);
}
