import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { usePresence } from '@/shared/hooks/use-presence';
import { cn } from '@/shared/lib/utils';
import { SlidersHorizontal, X, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Default width of the floating panel (Tailwind w-72 = 18rem = 288px).
const PANEL_WIDTH = 288;

/** What Tab can land on inside the panel. */
const FOCUSABLE =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Room kept between the panel and the edge of the window or dialog.
const EDGE = 8;

// Below this much room under the trigger, a panel in a dialog opens upward if there is more room above.
const MIN_PANEL = 160;

// Focus is in a select's open menu or on its open trigger (never the panel itself), which closes on Escape by itself
const inOpenMenu = (el: Element, panel: HTMLElement | null) =>
    el !== panel && (!!el.closest('[role="combobox"][aria-expanded="true"]') || !!el.querySelector('[role="listbox"]'));

/**
 * "Filters" trigger with a count badge and a floating panel (a labelled group, not a dialog); `children` gets `close`.
 * The panel portals to <body>, or into the nearest dialog so a modal still lets it be clicked and focused.
 */
export function FilterPopover({
    count,
    width = PANEL_WIDTH,
    onClear,
    resultCount,
    countLabel,
    label,
    icon: Icon = SlidersHorizontal,
    size = 'default',
    align = 'start',
    children,
}: {
    count: number;
    /** Trigger + panel title; defaults to the "Filters" string. */
    label?: string;
    icon?: LucideIcon;
    /** Trigger size — `sm` for a card heading. */
    size?: 'default' | 'sm';
    /** Panel edge to line up with the trigger. */
    align?: 'start' | 'end';
    /** Panel width in px — widen when the content lays out in multiple columns. */
    width?: number;
    /** Renders a "Clear all" button in the panel header (disabled while nothing is set). */
    onClear?: () => void;
    /** Live match count for the footer ("Found N items") — omit to hide the footer. */
    resultCount?: number;
    /** What the trigger's count means, read after the number by screen readers; defaults to "active filters". */
    countLabel?: string;
    children: (close: () => void) => ReactNode;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const [open, setOpen] = useState(false);
    const { mounted, closing } = usePresence(open);
    // maxHeight and bottom (opening upward) only inside a dialog; on a page the panel keeps its natural height below the trigger
    const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight?: number }>({ top: 0, left: 0 });
    // The dialog the trigger sits in, if any: the panel portals into it
    const [host, setHost] = useState<HTMLElement | null>(null);
    // Set when a panel in a dialog is taller than the room below, so its body scrolls
    const [scrolls, setScrolls] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    // A press inside the panel's React tree, including menus a select inside it portals elsewhere
    const pressedInside = useRef(false);
    const panelId = useId();
    const titleId = useId();

    /** Close; by default hand focus back to the trigger (not after an outside click — that moves it itself). */
    const close = (returnFocus = true) => {
        setOpen(false);
        if (returnFocus) triggerRef.current?.focus();
    };

    // Move focus into the panel once it is rendered (effects run after the portal is in the DOM):
    // the first control, else the panel itself.
    useEffect(() => {
        if (!open) return;
        const panel = panelRef.current;
        const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
        (first ?? panel)?.focus();
    }, [open]);

    // In a dialog, Escape closes only the panel: caught at window capture, ahead of the dialog's document listener
    useEffect(() => {
        if (!open || !host) return;
        const onKey = (e: globalThis.KeyboardEvent) => {
            const target = e.target as Element;
            if (e.key !== 'Escape' || !panelRef.current?.contains(target) || inOpenMenu(target, panelRef.current)) return;
            e.stopPropagation();
            e.preventDefault();
            close();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, host]);

    // Escape closes; Tab past the last control (or Shift+Tab before the first) leaves the panel back to the trigger
    const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
            return;
        }
        if (e.key !== 'Tab') return;
        const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const leavingForward = !e.shiftKey && (document.activeElement === last || focusable.length === 0);
        const leavingBack = e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current);
        if (leavingForward || leavingBack) {
            e.preventDefault();
            close();
        }
    };

    // Position the panel just under the trigger, inside the window or the dialog box it portals into
    const place = () => {
        const trigger = triggerRef.current;
        const r = trigger?.getBoundingClientRect();
        if (!trigger || !r) {
            return;
        }
        const dialog = trigger.closest<HTMLElement>('[role="dialog"]');
        const box = dialog?.getBoundingClientRect() ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
        const wanted = align === 'end' ? r.right - width : r.left;
        const left = Math.max(box.left + EDGE, Math.min(wanted, box.right - width - EDGE));
        const top = r.bottom + 4;
        setHost(dialog);
        if (!dialog) {
            setPos({ top, left });
            return;
        }
        // In a dialog: below by default, above when below is too cramped and above has more room
        const below = box.bottom - top - EDGE;
        const above = r.top - 4 - box.top - EDGE;
        const up = below < MIN_PANEL && above > below;
        setPos({
            top: up ? undefined : top - box.top,
            bottom: up ? box.bottom - r.top + 4 : undefined,
            left: left - box.left,
            // The roomier side when below is cramped, so the panel stays inside the dialog
            maxHeight: up ? above : below,
        });
    };

    // In a dialog, a panel taller than its room scrolls its body; measured from the content (scrolling or not), and again as it grows
    useLayoutEffect(() => {
        const panel = panelRef.current;
        const maxHeight = pos.maxHeight;
        if (!open || !panel || maxHeight === undefined) {
            setScrolls(false);
            return;
        }
        const body = panel.children[1];
        const measure = () => {
            const natural = Array.from(panel.children).reduce(
                (sum, part) => sum + (part === body ? part.scrollHeight : (part as HTMLElement).offsetHeight),
                2,
            );
            setScrolls(natural > maxHeight);
        };
        measure();
        const content = body?.firstElementChild;
        if (!content || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        observer.observe(content);
        return () => observer.disconnect();
    }, [open, pos.maxHeight]);

    const toggle = () => {
        setOpen((o) => {
            const next = !o;
            if (next) {
                place();
            }
            return next;
        });
    };

    // Close on outside click — accounts for the portaled panel living outside the trigger's DOM subtree.
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            const inTrigger = triggerRef.current?.contains(target);
            const inPanel = panelRef.current?.contains(target) || pressedInside.current;
            pressedInside.current = false;
            if (!inTrigger && !inPanel) {
                setOpen(false);
            }
        };
        window.addEventListener('mousedown', onDown);
        return () => window.removeEventListener('mousedown', onDown);
    }, []);

    // Re-anchor on scroll/resize so the panel stays glued to the trigger.
    useEffect(() => {
        if (!open) {
            return;
        }
        const onScroll = (e: Event) => {
            // Ignore scrolling that happens inside the panel itself.
            if (panelRef.current?.contains(e.target as Node)) {
                return;
            }
            place();
        };
        window.addEventListener('scroll', onScroll, { capture: true, passive: true });
        window.addEventListener('resize', place);
        return () => {
            window.removeEventListener('scroll', onScroll, { capture: true });
            window.removeEventListener('resize', place);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={toggle}
                aria-haspopup="true"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                className={cn(
                    'press flex items-center rounded-md border font-medium transition-colors',
                    size === 'sm' ? 'bg-background h-8 gap-1.5 px-2.5 text-xs' : 'h-10 gap-2 px-3 text-sm',
                    count > 0 ? 'border-brand/50 bg-brand/5 text-brand' : 'border-input hover:bg-accent',
                )}
            >
                <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
                {label ?? t('filters')}
                {count > 0 && (
                    <span className="bg-brand text-brand-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold">
                        {count}
                        <span className="sr-only"> {countLabel ?? t('filter_active_sr')}</span>
                    </span>
                )}
            </button>
            {mounted &&
                createPortal(
                    <div
                        ref={panelRef}
                        id={panelId}
                        role="group"
                        aria-labelledby={titleId}
                        tabIndex={-1}
                        onKeyDown={onPanelKeyDown}
                        onMouseDown={() => {
                            pressedInside.current = true;
                        }}
                        style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width, maxHeight: pos.maxHeight }}
                        className={cn(
                            'border-border bg-popover rounded-lg border shadow-md',
                            host ? 'absolute z-50 flex flex-col' : 'fixed z-[9999]',
                            closing ? 'motion-pop-out' : 'motion-pop-in',
                        )}
                    >
                        <div className="border-border/60 flex items-center gap-2 border-b px-3.5 py-2.5">
                            <Icon className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
                            <span id={titleId} className="text-sm font-semibold">
                                {label ?? t('filters')}
                            </span>
                            {count > 0 && (
                                <span className="bg-brand/10 text-brand flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold">
                                    {count}
                                </span>
                            )}
                            {onClear && (
                                <button
                                    type="button"
                                    onClick={onClear}
                                    disabled={count === 0}
                                    className="touch-hit text-muted-foreground hover:bg-accent hover:text-foreground relative ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
                                >
                                    <X className="h-3 w-3" />
                                    {t('filter_clear_all')}
                                </button>
                            )}
                        </div>

                        <div className={cn('p-3.5', scrolls && 'min-h-0 overflow-y-auto')}>{children(() => close())}</div>

                        {resultCount !== undefined && (
                            <div className="border-border/60 flex items-center gap-2 border-t px-3.5 py-2.5">
                                <span role="status" aria-live="polite" className="text-muted-foreground text-xs">
                                    {t('filter_found')} <span className="text-foreground text-[13px] font-bold">{fmtN(resultCount)}</span>{' '}
                                    {t('filter_items')}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => close()}
                                    className="bg-brand text-brand-foreground hover:bg-brand/90 ml-auto rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors"
                                >
                                    {t('done')}
                                </button>
                            </div>
                        )}
                    </div>,
                    host ?? document.body,
                )}
        </>
    );
}
