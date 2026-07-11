import { useT } from '@/lang';
import type { AppNotification } from '@/modules/notification';
import { useMarkRead, useNotifications } from '@/modules/notification';
import { cn } from '@/shared/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { iconMeta, notificationMessage, notificationTarget, notificationTitle } from './notification-display';

/** Asset query keys refreshed the instant an asset notification arrives, so the
 *  My Assets list (and the admin lists) update in step with the toast rather than
 *  lagging behind on their own separate poll cycle. */
const ASSET_QUERY_KEYS = [['assets-mine'], ['assets-list'], ['assets-pending-return'], ['assets-summary']] as const;

/** How long a toast stays before it auto-dismisses (must match the 6s ring animation in app.css). */
const TOAST_LIFE_MS = 6000;
/** Most toasts shown stacked at once; the rest wait in the queue and pop in as slots free up. */
const MAX_VISIBLE = 3;

/**
 * Pops a small toast in the bottom-right corner whenever a new unread
 * notification arrives during this session (detected from the polling
 * useNotifications query). Mount once near the app root.
 */
export function NotificationToaster() {
    const { data } = useNotifications();
    const qc = useQueryClient();
    // Ids we've already reacted to. Seeded from the first fetch so pre-existing
    // notifications never pop on page load — only genuinely new ones do.
    const seen = useRef<Set<string> | null>(null);
    // The full outstanding queue (oldest first). We only mount the first
    // MAX_VISIBLE below, so a burst of 13 surfaces 3-at-a-time: as each visible
    // toast dismisses it leaves the list, the next queued item slides into the
    // window and starts its own countdown. Nothing is silently dropped.
    const [queue, setQueue] = useState<AppNotification[]>([]);

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
        setQueue((prev) => [...prev, ...fresh]);

        // A fresh asset hand-over / return alert means the asset lists just changed —
        // refresh them now so they update alongside the toast, not on their own poll.
        if (fresh.some((n) => n.data.type?.startsWith('asset'))) {
            ASSET_QUERY_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
        }
    }, [data, qc]);

    const remove = useCallback((id: string) => {
        setQueue((prev) => prev.filter((n) => n.id !== id));
    }, []);

    // Dismiss every queued toast that opens the same destination — tapping one asset
    // hand-over sends you to My Assets, so the sibling toasts shouldn't keep popping in
    // behind you one after another. `exceptId` keeps the tapped toast in the queue so it
    // can play its own slide-out (beginClose) instead of being yanked instantly.
    const dismissGroup = useCallback((target: string, exceptId: string) => {
        setQueue((prev) => prev.filter((n) => n.id === exceptId || notificationTarget(n) !== target));
    }, []);

    if (queue.length === 0) return null;

    return createPortal(
        <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-80 max-w-[calc(100vw-2.5rem)] flex-col items-end gap-3">
            {queue.slice(0, MAX_VISIBLE).map((n) => (
                <ToastItem key={n.id} n={n} onClose={remove} onActivateGroup={dismissGroup} />
            ))}
        </div>,
        document.body,
    );
}

/**
 * A single bottom-right toast. Owns its auto-dismiss countdown (paused while
 * hovered so it stays in sync with the depleting progress ring), plays a
 * slide-out on close, then asks the parent to drop it from the stack.
 */
function ToastItem({
    n,
    onClose,
    onActivateGroup,
}: {
    n: AppNotification;
    onClose: (id: string) => void;
    onActivateGroup: (target: string, exceptId: string) => void;
}) {
    const t = useT();
    const navigate = useNavigate();
    const markRead = useMarkRead();
    const { Icon, color } = iconMeta(n);

    const [leaving, setLeaving] = useState(false);
    // The depleting ring IS the countdown: the toast closes when the ring's CSS animation
    // ends, and hover pauses that animation (see app.css), so the toast and the ring can
    // never drift apart. Reduced-motion users have no ring animation, so they get a plain
    // fallback timer instead (no hover-pause, but there's no ring to sync with anyway).
    const [reduceMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

    // Begin the slide-out, then remove from the stack once it finishes.
    const beginClose = useCallback(() => {
        setLeaving((already) => {
            if (already) return already;
            window.setTimeout(() => onClose(n.id), 300);
            return true;
        });
    }, [n.id, onClose]);

    useEffect(() => {
        if (!reduceMotion) return; // normal motion closes on the ring's animationend (below)
        const id = window.setTimeout(() => beginClose(), TOAST_LIFE_MS);
        return () => window.clearTimeout(id);
    }, [reduceMotion, beginClose]);

    // Click the body → mark read, close this toast (with its slide-out) and drop every
    // sibling heading to the same place, THEN navigate. Closing before navigating means
    // the tap always visibly dismisses the toast instead of leaving it to run out its
    // countdown ring if the route change re-renders mid-click.
    const handleActivate = () => {
        if (leaving) return;
        if (!n.read) markRead.mutate(n.id);
        const target = notificationTarget(n);
        onActivateGroup(target, n.id);
        beginClose();
        navigate(target);
    };

    return (
        <div
            onClick={handleActivate}
            className={cn(
                'toast-card border-border bg-popover pointer-events-auto flex w-80 max-w-full cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-3',
                leaving ? 'toast-leave' : 'toast-enter',
            )}
        >
            <span className={cn('relative h-[42px] w-[42px] shrink-0', color)}>
                <svg viewBox="0 0 42 42" className="absolute inset-0 -rotate-90">
                    <circle cx="21" cy="21" r="18" fill="none" strokeWidth="3" className="stroke-current opacity-15" />
                    <circle
                        cx="21"
                        cy="21"
                        r="18"
                        fill="none"
                        strokeWidth="3"
                        strokeLinecap="round"
                        className="toast-ring-fg stroke-current"
                        onAnimationEnd={() => beginClose()}
                    />
                </svg>
                <span className="absolute inset-0 grid place-items-center">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </span>

            <div className="min-w-0 flex-1">
                <div className="truncate text-sm leading-snug font-semibold">{notificationTitle(n)}</div>
                <div className="text-muted-foreground truncate text-xs">{notificationMessage(n, t)}</div>
            </div>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    beginClose();
                }}
                aria-label={t('notif_dismiss')}
                title={t('notif_dismiss')}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
