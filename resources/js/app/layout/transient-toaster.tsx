import { cn } from '@/shared/lib/utils';
import { useToastStore, type Toast, type ToastTone } from '@/stores/toast';
import { Info, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** How long a toast stays before it auto-dismisses (matches the 6s ring animation in app.css). */
const TOAST_LIFE_MS = 6000;
/** Most toasts shown stacked at once; the rest wait in the store and pop in as slots free up. */
const MAX_VISIBLE = 3;

/** Icon + accent color per tone. Error uses a bold X (matches the toast mockup). */
const TONE_META: Record<ToastTone, { Icon: typeof X; color: string; strokeWidth?: number }> = {
    error: { Icon: X, color: 'text-destructive', strokeWidth: 2.5 },
    info: { Icon: Info, color: 'text-primary' },
};

/**
 * Renders the app-wide transient toasts (bottom-right) held in useToastStore.
 * Mount once near the app root. Driven by ad-hoc pushes such as the rate-limit
 * warning from the axios interceptor (services/http.ts).
 */
export function TransientToaster() {
    const toasts = useToastStore((s) => s.toasts);

    if (toasts.length === 0) return null;

    return createPortal(
        <div className="pointer-events-none fixed right-5 bottom-5 z-[120] flex w-80 max-w-[calc(100vw-2.5rem)] flex-col items-end gap-3">
            {toasts.slice(0, MAX_VISIBLE).map((t) => (
                <ToastItem key={t.id} toast={t} />
            ))}
        </div>,
        document.body,
    );
}

/**
 * A single transient toast. Owns its auto-dismiss countdown (paused while
 * hovered so it stays in sync with the depleting progress ring), plays a
 * slide-out on close, then removes itself from the store.
 */
function ToastItem({ toast }: { toast: Toast }) {
    const dismiss = useToastStore((s) => s.dismiss);
    const { Icon, color, strokeWidth } = TONE_META[toast.tone];

    const [leaving, setLeaving] = useState(false);

    const timer = useRef<number | undefined>(undefined);
    const remaining = useRef(TOAST_LIFE_MS);
    const startedAt = useRef(0);

    // Begin the slide-out, then remove from the store once it finishes.
    const beginClose = useCallback(() => {
        setLeaving((already) => {
            if (already) return already;
            window.setTimeout(() => dismiss(toast.id), 300);
            return true;
        });
    }, [toast.id, dismiss]);

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

    return (
        <div
            onMouseEnter={pause}
            onMouseLeave={resume}
            className={cn(
                'toast-card border-border bg-popover pointer-events-auto flex w-80 max-w-full items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-3',
                leaving ? 'toast-leave' : 'toast-enter',
            )}
        >
            <span className={cn('relative h-[42px] w-[42px] shrink-0', color)}>
                <svg viewBox="0 0 42 42" className="absolute inset-0 -rotate-90">
                    <circle cx="21" cy="21" r="18" fill="none" strokeWidth="3" className="stroke-current opacity-15" />
                    <circle cx="21" cy="21" r="18" fill="none" strokeWidth="3" strokeLinecap="round" className="toast-ring-fg stroke-current" />
                </svg>
                <span className="absolute inset-0 grid place-items-center">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={strokeWidth} />
                </span>
            </span>

            <div className="min-w-0 flex-1 text-sm leading-snug">
                {toast.title && <div className="font-semibold">{toast.title}</div>}
                <div className={cn(toast.title ? 'font-normal' : 'font-medium')}>{toast.message}</div>
            </div>

            <button
                onClick={beginClose}
                aria-label="Dismiss"
                title="Dismiss"
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
