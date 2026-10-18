import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { nextPromotionAt, useToastStore, visibleToasts, type Toast, type ToastIcon, type ToastTone } from '@/stores/toast';
import { Check, Info, Trash2, TriangleAlert, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Per-tone glyph and colours (emerald=success, amber=warning, red=error, blue=info). */
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

/** Progress-bar lengths spelled out so Tailwind generates them; must match the JS countdown. */
const BAR_LIFE: Record<number, string> = {
    4000: '[animation-duration:4000ms]',
    5000: '[animation-duration:5000ms]',
    6000: '[animation-duration:6000ms]',
    8000: '[animation-duration:8000ms]',
};

const interrupts = (toast: Toast) => toast.tone === 'error' && !toast.polite;

/**
 * The app's single toast corner (bottom-right). Two always-mounted live regions: errors
 * interrupt (assertive) and sit on top, everything else is read politely below them.
 */
export function Toaster() {
    const t = useT();
    const toasts = useToastStore((s) => s.toasts);
    const lastShownAt = useToastStore((s) => s.lastShownAt);
    const promote = useToastStore((s) => s.promote);
    const visible = visibleToasts(toasts);

    // Wake when the next waiting toast may enter; a dismiss changes `toasts` and re-arms this
    useEffect(() => {
        const at = nextPromotionAt(toasts, lastShownAt);
        if (at === null) return;
        const timer = window.setTimeout(() => promote(), Math.max(0, at - Date.now()) + 16);
        return () => window.clearTimeout(timer);
    }, [toasts, lastShownAt, promote]);

    return createPortal(
        <section
            aria-label={t('toast_region')}
            className="pointer-events-none fixed right-5 bottom-5 z-[120] flex w-[320px] max-w-[calc(100vw-2.5rem)] flex-col items-end gap-2.5"
        >
            <div aria-live="assertive" aria-relevant="additions" className="flex w-full flex-col items-end gap-2.5">
                {visible.filter(interrupts).map((toast) => (
                    <ToastItem key={toast.id} toast={toast} />
                ))}
            </div>
            <div aria-live="polite" aria-relevant="additions" className="flex w-full flex-col items-end gap-2.5">
                {visible
                    .filter((toast) => !interrupts(toast))
                    .map((toast) => (
                        <ToastItem key={toast.id} toast={toast} />
                    ))}
            </div>
        </section>,
        document.body,
    );
}

/** One toast. Its countdown pauses while hovered or while focus is inside it (the bar pauses via CSS). */
function ToastItem({ toast }: { toast: Toast }) {
    const t = useT();
    const dismiss = useToastStore((s) => s.dismiss);
    const dismissGroup = useToastStore((s) => s.dismissGroup);
    const { Icon: ToneIcon, badge, border, bar } = TONE_META[toast.tone];
    const Icon = toast.Icon ?? (toast.icon ? ICON_OVERRIDES[toast.icon] : ToneIcon);
    const hasTitle = Boolean(toast.title);
    const sticky = toast.duration === null;

    const [leaving, setLeaving] = useState(false);
    const leavingRef = useRef(false);
    const removeTimer = useRef<number | undefined>(undefined);
    const lifeTimer = useRef<number | undefined>(undefined);
    const remaining = useRef(toast.duration ?? 0);
    const startedAt = useRef(0);
    // Hover and focus each hold the countdown; it runs only when neither does
    const held = useRef({ hover: false, focus: false });

    const beginClose = () => {
        if (leavingRef.current) return;
        leavingRef.current = true;
        window.clearTimeout(lifeTimer.current);
        setLeaving(true);
        removeTimer.current = window.setTimeout(() => dismiss(toast.id), 300);
    };
    const closeRef = useRef(beginClose);
    closeRef.current = beginClose;

    const run = () => {
        startedAt.current = Date.now();
        lifeTimer.current = window.setTimeout(() => closeRef.current(), Math.max(0, remaining.current));
    };

    useEffect(() => {
        if (toast.duration === null) return;
        run();
        return () => {
            window.clearTimeout(lifeTimer.current);
            window.clearTimeout(removeTimer.current);
        };
    }, [toast.duration]);

    const hold = (reason: 'hover' | 'focus', on: boolean) => {
        if (sticky || leavingRef.current || held.current[reason] === on) return;
        const wasRunning = !held.current.hover && !held.current.focus;
        held.current[reason] = on;
        const nowRunning = !held.current.hover && !held.current.focus;
        if (wasRunning && !nowRunning) {
            window.clearTimeout(lifeTimer.current);
            remaining.current -= Date.now() - startedAt.current;
        } else if (!wasRunning && nowRunning) {
            run();
        }
    };

    const activate = () => {
        if (leavingRef.current || !toast.onActivate) return;
        toast.onActivate();
        if (toast.group) dismissGroup(toast.group, toast.id);
        beginClose();
    };

    const body = (
        <>
            <span aria-hidden className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-white', badge)}>
                <Icon className="h-4 w-4" strokeWidth={2.5} />
            </span>
            {/* A step smaller than body copy: a toast is read at a glance */}
            <span className="min-w-0 flex-1 text-[13px] leading-snug">
                {hasTitle && <span className="text-foreground line-clamp-1 block font-bold">{toast.title}</span>}
                {/* Two lines then ellipsis; an error stays until dismissed, so it shows in full */}
                <span
                    className={cn(
                        'block',
                        !sticky && 'line-clamp-2',
                        hasTitle ? 'text-muted-foreground mt-0.5 text-[11.5px] font-medium' : 'text-foreground font-bold',
                    )}
                >
                    {toast.message}
                </span>
            </span>
        </>
    );

    return (
        <div
            onMouseEnter={() => hold('hover', true)}
            onMouseLeave={() => hold('hover', false)}
            onFocus={() => hold('focus', true)}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hold('focus', false);
            }}
            className={cn(
                'toast-card bg-popover pointer-events-auto w-[320px] max-w-full overflow-hidden rounded-xl border',
                border,
                leaving ? 'toast-leave' : 'toast-enter',
            )}
        >
            <div className={cn('flex min-h-[2.25rem] gap-1 py-3 pr-2 pl-3.5', hasTitle ? 'items-start' : 'items-center')}>
                {toast.onActivate ? (
                    <button
                        type="button"
                        onClick={activate}
                        className={cn(
                            'focus-visible:ring-ring -m-1 flex min-w-0 flex-1 cursor-pointer gap-2.5 rounded-lg p-1 text-left focus-visible:ring-2 focus-visible:outline-none',
                            hasTitle ? 'items-start' : 'items-center',
                        )}
                    >
                        {body}
                    </button>
                ) : (
                    <div className={cn('flex min-w-0 flex-1 gap-2.5', hasTitle ? 'items-start' : 'items-center')}>{body}</div>
                )}

                <button
                    type="button"
                    onClick={beginClose}
                    aria-label={t('notif_dismiss')}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring relative flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-md transition-colors after:absolute after:-inset-2 focus-visible:ring-2 focus-visible:outline-none"
                >
                    <X className="h-3.5 w-3.5" aria-hidden />
                </button>
            </div>

            {/* Depletes over the toast's life; a toast that waits to be dismissed has none */}
            {!sticky && (
                <div className="bg-muted h-1">
                    <span className={cn('toast-bar-fg block h-full', bar, BAR_LIFE[toast.duration!] ?? BAR_LIFE[6000])} />
                </div>
            )}
        </div>
    );
}
