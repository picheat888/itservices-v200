import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { SlidersHorizontal, X, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Default width of the floating panel (Tailwind w-72 = 18rem = 288px).
const PANEL_WIDTH = 288;

/** What Tab can land on inside the panel. */
const FOCUSABLE =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * FilterPopover — a "Filters" trigger button with an active-count badge that
 * opens a small floating panel. Keeps crowded filter controls out of the toolbar.
 * `children` receives a `close` callback so the panel can dismiss itself.
 *
 * The panel is rendered as a portal at document.body with fixed positioning so it
 * is never clipped by an `overflow-hidden` ancestor (e.g. the Stock Card).
 *
 * `label` / `icon` rename the trigger and panel title for other "pick from a list" panels
 * (e.g. the report column picker); they default to "Filters" + the sliders icon.
 * `size="sm"` shrinks the trigger to sit in a card heading; `align="end"` opens the panel
 * right-aligned under it, for a trigger at the right edge of its row.
 *
 * Keyboard and screen readers (WCAG 2.1.1, 2.4.3, 4.1.2, 4.1.3): the trigger says whether the
 * panel is open (aria-expanded) and names it; the panel is a labelled group — not role="dialog",
 * which would make every SearchableSelect inside portal into the small panel and measure its
 * room against it (see searchable-select.tsx), cramping or flipping their lists. Opening
 * moves focus into it — it is portalled to the end of <body>, so Tab from the trigger would
 * otherwise skip it. Escape, Done, or tabbing past either end closes it and hands focus back to
 * the trigger. The "Found N" count is a polite live region.
 */
export function FilterPopover({
    count,
    width = PANEL_WIDTH,
    onClear,
    resultCount,
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
    children: (close: () => void) => ReactNode;
}) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
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

    // Escape closes; Tab past the last control (or Shift+Tab before the first) leaves the panel
    // back to the trigger, so the reader's place on the page is kept.
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

    // Position the panel just under the trigger; clamp so it never spills past the right edge.
    const place = () => {
        const r = triggerRef.current?.getBoundingClientRect();
        if (!r) {
            return;
        }
        const left = Math.min(align === 'end' ? r.right - width : r.left, window.innerWidth - width - 8);
        setPos({ top: r.bottom + 4, left: Math.max(8, left) });
    };

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
            const inPanel = panelRef.current?.contains(target);
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
                    'flex items-center rounded-md border font-medium transition-colors',
                    size === 'sm' ? 'bg-background h-8 gap-1.5 px-2.5 text-xs' : 'h-10 gap-2 px-3 text-sm',
                    count > 0 ? 'border-brand/50 bg-brand/5 text-brand' : 'border-input hover:bg-accent',
                )}
            >
                <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
                {label ?? t('filters')}
                {count > 0 && (
                    <span className="bg-brand text-brand-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold">
                        {count}
                        <span className="sr-only"> {t('filter_active_sr')}</span>
                    </span>
                )}
            </button>
            {open &&
                createPortal(
                    <div
                        ref={panelRef}
                        id={panelId}
                        role="group"
                        aria-labelledby={titleId}
                        tabIndex={-1}
                        onKeyDown={onPanelKeyDown}
                        style={{ position: 'fixed', top: pos.top, left: pos.left, width, zIndex: 9999 }}
                        className="border-border bg-popover rounded-lg border shadow-md motion-safe:animate-[filter-pop_0.28s_cubic-bezier(0.16,1,0.3,1)]"
                    >
                        {/* Scoped keyframes for the panel's pop-in (skipped under prefers-reduced-motion). */}
                        <style>{`@keyframes filter-pop{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}`}</style>

                        <div className="border-border/60 flex items-center gap-2 border-b px-3.5 py-2.5">
                            <Icon className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
                            <span id={titleId} className="text-sm font-semibold">
                                {label ?? t('filters')}
                            </span>
                            {count > 0 && (
                                <span className="bg-brand/10 text-brand flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[11px] font-bold">
                                    {count}
                                </span>
                            )}
                            {onClear && (
                                <button
                                    type="button"
                                    onClick={onClear}
                                    disabled={count === 0}
                                    className="text-muted-foreground hover:bg-accent hover:text-foreground ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
                                >
                                    <X className="h-3 w-3" />
                                    {t('filter_clear_all')}
                                </button>
                            )}
                        </div>

                        <div className="p-3.5">{children(() => close())}</div>

                        {resultCount !== undefined && (
                            <div className="border-border/60 flex items-center gap-2 border-t px-3.5 py-2.5">
                                <span role="status" aria-live="polite" className="text-muted-foreground text-xs">
                                    {t('filter_found')} <span className="text-foreground font-mono text-[13px] font-bold">{resultCount}</span>{' '}
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
                    document.body,
                )}
        </>
    );
}
