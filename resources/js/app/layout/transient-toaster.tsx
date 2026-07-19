import { cn } from '@/shared/lib/utils';
import { useToastStore, type Toast, type ToastIcon, type ToastTone } from '@/stores/toast';
import { Check, Info, Trash2, TriangleAlert, Users, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** How long a toast stays before it auto-dismisses (matches the 6s bar animation in app.css). */
const TOAST_LIFE_MS = 6000;
/** Most toasts shown stacked at once; the rest wait in the store and pop in as slots free up. */
const MAX_VISIBLE = 3;

/**
 * Per-tone icon + colour classes for the toast card, aligned with the app-wide status
 * palette (emerald=success, amber=warning, red=error, blue=info):
 *   - `Icon`   : the lucide glyph drawn white inside the solid badge
 *   - `badge`  : solid circle background behind the white icon
 *   - `border` : the card's tone-tinted border
 *   - `bar`    : the bottom progress bar fill
 */
const TONE_META: Record<ToastTone, { Icon: typeof X; badge: string; border: string; bar: string }> = {
    success: { Icon: Check, badge: 'bg-emerald-600', border: 'border-emerald-200 dark:border-emerald-900', bar: 'bg-emerald-600' },
    error: { Icon: X, badge: 'bg-red-600', border: 'border-red-200 dark:border-red-900', bar: 'bg-red-600' },
    warning: { Icon: TriangleAlert, badge: 'bg-amber-500', border: 'border-amber-200 dark:border-amber-900', bar: 'bg-amber-500' },
    info: { Icon: Info, badge: 'bg-blue-600', border: 'border-blue-200 dark:border-blue-900', bar: 'bg-blue-600' },
};

/** Glyph overrides for the optional per-toast `icon` (keeps the tone's colours). */
const ICON_OVERRIDES: Record<ToastIcon, typeof X> = {
    trash: Trash2,
    users: Users,
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
 * hovered so it stays in sync with the depleting progress bar), plays a
 * slide-out on close, then removes itself from the store.
 */
function ToastItem({ toast }: { toast: Toast }) {
    const dismiss = useToastStore((s) => s.dismiss);
    const { Icon: ToneIcon, badge, border, bar } = TONE_META[toast.tone];
    // Per-toast icon override wins over the tone's default glyph (colours stay tone-based).
    const Icon = toast.icon ? ICON_OVERRIDES[toast.icon] : ToneIcon;
    const hasTitle = Boolean(toast.title);

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

    /** Hover in: freeze the countdown (the bar pauses via CSS in parallel). */
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
                'toast-card bg-popover pointer-events-auto w-80 max-w-full overflow-hidden rounded-xl border',
                border,
                leaving ? 'toast-leave' : 'toast-enter',
            )}
        >
            <div className={cn('flex min-h-[2.5rem] gap-3 px-4 py-3.5', hasTitle ? 'items-start' : 'items-center')}>
                <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full text-white', badge)}>
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2.5} />
                </span>

                <div className="min-w-0 flex-1 text-sm leading-snug">
                    {hasTitle && <div className="text-foreground font-bold">{toast.title}</div>}
                    <div className={cn(hasTitle ? 'text-muted-foreground mt-0.5 text-[13px] font-medium' : 'text-foreground font-bold')}>
                        {toast.message}
                    </div>
                </div>

                <button
                    onClick={beginClose}
                    aria-label="Dismiss"
                    title="Dismiss"
                    className="text-muted-foreground hover:bg-accent hover:text-foreground -mr-1 flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-md transition-colors"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Bottom progress bar — depletes over the 6s life (paused on hover / while leaving). */}
            <div className="bg-muted h-1">
                <span className={cn('toast-bar-fg block h-full', bar)} />
            </div>
        </div>
    );
}
