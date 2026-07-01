import { useT } from '@/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Fixed width of the floating panel (Tailwind w-72 = 18rem = 288px).
const PANEL_WIDTH = 288;

/**
 * FilterPopover — a "Filters" trigger button with an active-count badge that
 * opens a small floating panel. Keeps crowded filter controls out of the toolbar.
 * `children` receives a `close` callback so the panel can dismiss itself.
 *
 * The panel is rendered as a portal at document.body with fixed positioning so it
 * is never clipped by an `overflow-hidden` ancestor (e.g. the Stock Card).
 */
export function FilterPopover({ count, children }: { count: number; children: (close: () => void) => ReactNode }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // Position the panel just under the trigger; clamp so it never spills past the right edge.
    const place = () => {
        const r = triggerRef.current?.getBoundingClientRect();
        if (!r) {
            return;
        }
        const left = Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8);
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
    }, [open]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={toggle}
                className={cn(
                    'flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
                    count > 0 ? 'border-brand/50 bg-brand/5 text-brand' : 'border-input hover:bg-accent',
                )}
            >
                <SlidersHorizontal className="h-4 w-4" />
                {t('filters')}
                {count > 0 && (
                    <span className="bg-brand text-brand-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold">
                        {count}
                    </span>
                )}
            </button>
            {open &&
                createPortal(
                    <div
                        ref={panelRef}
                        style={{ position: 'fixed', top: pos.top, left: pos.left, width: PANEL_WIDTH, zIndex: 9999 }}
                        className="border-border bg-popover rounded-lg border p-3 shadow-md"
                    >
                        {children(() => setOpen(false))}
                    </div>,
                    document.body,
                )}
        </>
    );
}
