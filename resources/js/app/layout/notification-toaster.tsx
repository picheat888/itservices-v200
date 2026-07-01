import { useMarkRead, useNotifications } from '@/hooks/use-notifications';
import { useT } from '@/lib/i18n';
import { cn } from '@/shared/lib/utils';
import type { AppNotification } from '@/services/notificationApi';
import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { iconMeta, notificationMessage, notificationTarget, notificationTitle } from './notification-display';

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
    }, [data]);

    const remove = useCallback((id: string) => {
        setQueue((prev) => prev.filter((n) => n.id !== id));
    }, []);

    if (queue.length === 0) return null;

    return createPortal(
        <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-80 max-w-[calc(100vw-2.5rem)] flex-col items-end gap-3">
            {queue.slice(0, MAX_VISIBLE).map((n) => (
                <ToastItem key={n.id} n={n} onClose={remove} />
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
function ToastItem({ n, onClose }: { n: AppNotification; onClose: (id: string) => void }) {
    const t = useT();
    const navigate = useNavigate();
    const markRead = useMarkRead();
    const { Icon, color } = iconMeta(n);

    const [leaving, setLeaving] = useState(false);

    const timer = useRef<number | undefined>(undefined);
    const remaining = useRef(TOAST_LIFE_MS);
    const startedAt = useRef(0);

    // Begin the slide-out, then remove from the stack once it finishes.
    const beginClose = useCallback(() => {
        setLeaving((already) => {
            if (already) return already;
            window.setTimeout(() => onClose(n.id), 300);
            return true;
        });
    }, [n.id, onClose]);

    // Keep the latest beginClose reachable from the one-shot timer below without
    // re-arming the countdown on every render.
    const closeRef = useRef(beginClose);
    closeRef.current = beginClose;

    useEffect(() => {
        startedAt.current = Date.now();
        timer.current = window.setTimeout(() => closeRef.current(), remaining.current);
        return () => window.clearTimeout(timer.current);
    }, []);

    /** Hover in: freeze the countdown (the ring pauses via CSS in parallel). */
    const pause = () => {
        window.clearTimeout(timer.current);
        remaining.current -= Date.now() - startedAt.current;
    };

    /** Hover out: resume the countdown for whatever time is left. */
    const resume = () => {
        if (leaving) return;
        startedAt.current = Date.now();
        timer.current = window.setTimeout(() => closeRef.current(), remaining.current);
    };

    // Click the body → mark read, jump to the related record, then dismiss.
    const handleActivate = () => {
        if (!n.read) markRead.mutate(n.id);
        navigate(notificationTarget(n));
        beginClose();
    };

    return (
        <div
            onMouseEnter={pause}
            onMouseLeave={resume}
            onClick={handleActivate}
            className={cn(
                'toast-card border-border bg-popover pointer-events-auto flex w-80 max-w-full cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-3 shadow-lg',
                leaving ? 'toast-leave' : 'toast-enter',
            )}
        >
            <span className={cn('relative h-[42px] w-[42px] shrink-0', color)}>
                <svg viewBox="0 0 42 42" className="absolute inset-0 -rotate-90">
                    <circle cx="21" cy="21" r="18" fill="none" strokeWidth="3" className="stroke-current opacity-15" />
                    <circle cx="21" cy="21" r="18" fill="none" strokeWidth="3" strokeLinecap="round" className="toast-ring-fg stroke-current" />
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
