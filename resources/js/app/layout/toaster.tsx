import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { nextRevealAt, useToastStore, visibleToasts, type Toast, type ToastIcon, type ToastTone } from '@/stores/toast';
import { Check, Info, Trash2, TriangleAlert, Users, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Most toasts on screen at once; the rest wait in the store and pop in as slots free up. */
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
 * Progress-bar lengths, spelled out per duration so Tailwind can see the class in
 * the source (a composed `[animation-duration:${ms}ms]` would never be generated).
 * The bar has to match the JS countdown exactly or it lies about the time left.
 */
const BAR_LIFE: Record<number, string> = {
    4000: '[animation-duration:4000ms]',
    5000: '[animation-duration:5000ms]',
    6000: '[animation-duration:6000ms]',
    8000: '[animation-duration:8000ms]',
};

/**
 * The app's single toast region (bottom-right), rendering the queue held in
 * useToastStore: save/delete confirmations, the rate-limit warning from the axios
 * interceptor, and server notifications that arrive mid-session. Mount once near
 * the app root.
 *
 * The region stays mounted even when empty. Assistive tech announces changes
 * *inside* a live region it already knows about, so a container that appears
 * along with its first toast can be missed entirely.
 */
export function Toaster() {
    const t = useT();
    const toasts = useToastStore((s) => s.toasts);
    // Bumped when a queued toast comes due, purely to re-render — a burst enters one
    // card at a time (TOAST_STAGGER_MS) rather than all in the same frame.
    const [, setDueTick] = useState(0);

    // Which three are on screen — the rule itself lives in the store (visibleToasts).
    const visible = visibleToasts(toasts, MAX_VISIBLE);

    // Wake up exactly when the next queued toast is due, then arm the one after it.
    // No interval — between arrivals there is nothing to recompute.
    useEffect(() => {
        let timer: number | undefined;
        const armNextArrival = () => {
            const due = nextRevealAt(toasts);
            if (due === null) return;
            timer = window.setTimeout(
                () => {
                    setDueTick((n) => n + 1); // re-render so the card that just came due mounts
                    armNextArrival();
                },
                Math.max(0, due - Date.now()) + 16,
            );
        };
        armNextArrival();
        return () => window.clearTimeout(timer);
    }, [toasts]);

    return createPortal(
        <div
            role="region"
            aria-label={t('toast_region')}
            className="pointer-events-none fixed right-5 bottom-5 z-[120] flex w-[320px] max-w-[calc(100vw-2.5rem)] flex-col items-end gap-2.5"
        >
            {visible.map((toast) => (
                <ToastItem key={toast.id} toast={toast} />
            ))}
        </div>,
        document.body,
    );
}

/**
 * A single toast. Owns its auto-dismiss countdown — paused while hovered OR while
 * anything inside it holds focus, so a keyboard user reading it never has it
 * expire mid-sentence (the progress bar pauses with it via CSS). A toast with
 * `duration: null` has no countdown and no bar: it waits to be dismissed.
 */
function ToastItem({ toast }: { toast: Toast }) {
    const t = useT();
    const dismiss = useToastStore((s) => s.dismiss);
    const dismissGroup = useToastStore((s) => s.dismissGroup);
    const { Icon: ToneIcon, badge, border, bar } = TONE_META[toast.tone];
    // Per-toast icon override wins over the tone's default glyph (colours stay tone-based).
    const Icon = toast.Icon ?? (toast.icon ? ICON_OVERRIDES[toast.icon] : ToneIcon);
    const hasTitle = Boolean(toast.title);
    const activatable = Boolean(toast.onActivate);

    const [leaving, setLeaving] = useState(false);

    const timer = useRef<number | undefined>(undefined);
    const remaining = useRef(toast.duration ?? 0);
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
        if (toast.duration === null) return; // waits to be dismissed
        startedAt.current = Date.now();
        timer.current = window.setTimeout(() => closeRef.current(), remaining.current);
        return () => window.clearTimeout(timer.current);
    }, [toast.duration]);

    /** Hover/focus in: freeze the countdown (the bar pauses via CSS in parallel). */
    const pause = () => {
        if (toast.duration === null) return;
        window.clearTimeout(timer.current);
        remaining.current -= Date.now() - startedAt.current;
    };

    /** Hover/focus out: resume the countdown for whatever time is left. */
    const resume = () => {
        if (toast.duration === null || leaving) return;
        startedAt.current = Date.now();
        timer.current = window.setTimeout(() => closeRef.current(), remaining.current);
    };

    /**
     * Activate: run the toast's action, drop every sibling heading to the same place
     * (tapping one alert about a page shouldn't leave the others queueing in behind
     * you), then play this card's own slide-out.
     */
    const activate = () => {
        if (leaving || !toast.onActivate) return;
        toast.onActivate();
        if (toast.group) dismissGroup(toast.group, toast.id);
        beginClose();
    };

    return (
        <div
            // An error interrupts (assertive); everything else waits its turn in the
            // reading order (polite). `alert` carries assertive on its own.
            role={toast.tone === 'error' ? 'alert' : 'status'}
            aria-live={toast.tone === 'error' ? undefined : 'polite'}
            aria-atomic="true"
            onMouseEnter={pause}
            onMouseLeave={resume}
            onFocus={pause}
            onBlur={resume}
            onClick={activatable ? activate : undefined}
            onKeyDown={
                activatable
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              activate();
                          }
                      }
                    : undefined
            }
            tabIndex={activatable ? 0 : undefined}
            className={cn(
                // One width for every toast, narrower than the notification tray on purpose: a
                // toast is glanced at, not read. Anything past the one title line and two body
                // lines is clipped with an ellipsis — the full text is one click away in the
                // tray, and a message needing three lines to land was written too long for this
                // surface rather than given too small a box.
                'toast-card bg-popover pointer-events-auto w-[320px] max-w-full overflow-hidden rounded-xl border',
                'focus-visible:ring-ring ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                border,
                activatable && 'cursor-pointer',
                leaving ? 'toast-leave' : 'toast-enter',
            )}
        >
            <div className={cn('flex min-h-[2.25rem] gap-2.5 px-3.5 py-3', hasTitle ? 'items-start' : 'items-center')}>
                <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-white', badge)}>
                    <Icon className="h-4 w-4" strokeWidth={2.5} />
                </span>

                {/* Compact on purpose: a toast is read at a glance and out of the corner of the
                    eye, so it is set a step smaller than body copy rather than at it. */}
                <div className="min-w-0 flex-1 text-[13px] leading-snug">
                    {hasTitle && <div className="text-foreground line-clamp-1 font-bold">{toast.title}</div>}
                    {/* Two lines, then ellipsis: a message worth showing is worth reading,
                        and one truncated line cut most of ours off mid-sentence. */}
                    <div
                        className={cn(
                            'line-clamp-2',
                            hasTitle ? 'text-muted-foreground mt-0.5 text-[11.5px] font-medium' : 'text-foreground font-bold',
                        )}
                    >
                        {toast.message}
                    </div>
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        beginClose();
                    }}
                    aria-label={t('notif_dismiss')}
                    title={t('notif_dismiss')}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring -mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center self-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Bottom progress bar — depletes over this toast's life (paused on hover /
                focus / while leaving). A toast that never expires shows no bar: there is
                no countdown to draw. */}
            {toast.duration !== null && (
                <div className="bg-muted h-1">
                    <span className={cn('toast-bar-fg block h-full', bar, BAR_LIFE[toast.duration] ?? BAR_LIFE[6000])} />
                </div>
            )}
        </div>
    );
}
