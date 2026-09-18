import { useT } from '@/lang';
import type { SelectOption } from '@/shared/lib/locale-data';
import { cn } from '@/shared/lib/utils';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface SearchSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    className?: string;
}

interface DropdownRect {
    left: number;
    /** The trigger's width — a floor for the panel, not its width (see the style below). */
    width: number;
    maxWidth: number;
    /** Set when the panel drops below the trigger; `bottom` is set instead when it drops above. */
    top?: number;
    bottom?: number;
    // Cap so the panel never spills past the edge of the viewport.
    maxHeight: number;
}

/** Tallest the panel gets, and the least room it will settle for before dropping upward instead. */
const PANEL_MAX = 320;
const PANEL_MIN = 160;
/** Widest the panel grows past its trigger. */
const PANEL_MAX_W = 320;

/**
 * The nearest ancestor of the trigger that actually scrolls.
 *
 * The panel is portaled to <body> so it cannot be clipped, which also cuts it out of the
 * trigger's ancestry: a wheel over the panel walks up to <body>, finds nothing scrollable
 * there (this app scrolls inside <main>), and the page sits still. The trigger has not moved,
 * so its own ancestry is where the scroll belongs.
 */
function scrollableAncestor(from: HTMLElement | null): HTMLElement | null {
    for (let el = from?.parentElement; el; el = el.parentElement) {
        const { overflowY } = getComputedStyle(el);
        if (/auto|scroll/.test(overflowY) && el.scrollHeight > el.clientHeight) {
            return el;
        }
    }

    return null;
}

/** Dropdown with an inline search box, rendered as a portal so it is never clipped by parent overflow. */
export function SearchSelect({ value, onChange, options, placeholder, className }: SearchSelectProps) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [rect, setRect] = useState<DropdownRect>({ left: 0, width: 0, maxWidth: PANEL_MAX_W, top: 0, maxHeight: PANEL_MAX });
    const triggerRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const selected = options.find((o) => o.value === value);
    // One option with an icon gives every row the slot, so labels keep one left edge.
    const hasIcons = options.some((o) => o.icon !== undefined);

    const filtered =
        query === ''
            ? options
            : options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()) || o.value.toLowerCase().includes(query.toLowerCase()));

    const handleOpen = () => {
        if (triggerRef.current) {
            const r = triggerRef.current.getBoundingClientRect();
            const margin = 8;
            const below = window.innerHeight - r.bottom - margin;
            const above = r.top - margin;
            // Drop below by default, and above only when below is too cramped to read and above
            // is roomier. It used to always drop below, so a row near the foot of the page opened
            // a panel a few pixels tall — a list with nowhere to put its own options.
            const up = below < PANEL_MIN && above > below;
            const room = up ? above : below;
            setRect({
                left: r.left,
                width: r.width,
                // Grow rightward to whatever the labels need, stopping short of the window edge.
                maxWidth: Math.max(r.width, Math.min(PANEL_MAX_W, window.innerWidth - r.left - margin)),
                top: up ? undefined : r.bottom + 4,
                bottom: up ? window.innerHeight - r.top + 4 : undefined,
                maxHeight: Math.max(PANEL_MIN, Math.min(PANEL_MAX, room)),
            });
        }
        setOpen((prev) => !prev);
    };

    const handleClose = () => {
        setOpen(false);
        setQuery('');
    };

    const handleSelect = (v: string) => {
        onChange(v);
        handleClose();
    };

    // Close on outside click
    useEffect(() => {
        function onMouseDown(e: MouseEvent) {
            const target = e.target as Node;
            const isInsideTrigger = triggerRef.current?.contains(target);
            const isInsideDropdown = (document.getElementById('search-select-portal') as HTMLElement | null)?.contains(target);
            if (!isInsideTrigger && !isInsideDropdown) handleClose();
        }
        if (open) document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [open]);

    // Auto-focus search input when opened
    useEffect(() => {
        if (open) setTimeout(() => searchRef.current?.focus(), 0);
    }, [open]);

    // Close on scroll/resize to avoid stale position, but ignore scroll inside the dropdown itself
    useEffect(() => {
        if (!open) return;
        const close = (e: Event) => {
            const portal = document.getElementById('search-select-portal');
            if (portal && portal.contains(e.target as Node)) return;
            handleClose();
        };
        window.addEventListener('scroll', close, { capture: true, passive: true });
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, { capture: true });
            window.removeEventListener('resize', close);
        };
    }, [open]);

    /**
     * Hand the wheel to the page once the option list has nothing left to give.
     *
     * A browser chains an unspent wheel to the next scrollable ancestor; the portal breaks that
     * chain, so without this the gesture reaches nothing at all — no scroll event, so not even
     * the close-on-scroll below fires, and the control reads as frozen rather than as a menu
     * that is staying put. Scrolling the page then closes the panel through that same handler,
     * which is what scrolling anywhere else on the page already does.
     */
    const forwardWheel = (e: React.WheelEvent) => {
        const list = listRef.current;
        if (list) {
            const left = e.deltaY > 0 ? list.scrollHeight - list.clientHeight - list.scrollTop : list.scrollTop;
            if (left > 0) {
                return;
            }
        }
        scrollableAncestor(triggerRef.current)?.scrollBy({ top: e.deltaY });
    };

    return (
        <>
            {/* Trigger — stays in normal document flow */}
            <button
                ref={triggerRef}
                type="button"
                onClick={handleOpen}
                className={cn(
                    'border-input bg-background flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm',
                    'hover:border-brand/50 focus:border-brand focus:ring-brand/15 transition-colors focus:ring-[3px] focus:outline-hidden',
                    // Keep the brand border + soft ring latched while the dropdown is open.
                    open && 'border-brand ring-brand/15 ring-[3px]',
                    !selected && 'text-muted-foreground',
                    className,
                )}
            >
                <span className="flex min-w-0 items-center gap-2">
                    {selected?.icon !== undefined && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{selected.icon}</span>}
                    <span className="truncate">{selected ? selected.label : (placeholder ?? t('select_placeholder'))}</span>
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </button>

            {/* Dropdown rendered at document.body to escape any overflow:hidden ancestor */}
            {open &&
                createPortal(
                    <div
                        id="search-select-portal"
                        onWheel={forwardWheel}
                        style={{
                            position: 'fixed',
                            top: rect.top,
                            bottom: rect.bottom,
                            left: rect.left,
                            // The trigger's width is a floor, not the width: in a 128px column a
                            // panel sized to its trigger cut "Network" down to "Net…", which is
                            // not a list you can read. Panels are portaled, so a wider one
                            // disturbs no layout.
                            minWidth: rect.width,
                            maxWidth: rect.maxWidth,
                            width: 'max-content',
                            maxHeight: rect.maxHeight,
                            zIndex: 9999,
                        }}
                        className="bg-popover flex flex-col overflow-hidden rounded-md border shadow-md"
                    >
                        {/* Search row */}
                        <div className="flex shrink-0 items-center border-b px-3">
                            <Search className="text-muted-foreground mr-2 h-4 w-4 shrink-0" />
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Escape' && handleClose()}
                                className="placeholder:text-muted-foreground flex h-10 w-full bg-transparent py-2 text-sm outline-none"
                                placeholder={t('search_placeholder_short')}
                            />
                        </div>

                        {/* Options list */}
                        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
                            {filtered.length === 0 ? (
                                <div className="text-muted-foreground px-3 py-2 text-sm">No results</div>
                            ) : (
                                filtered.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        disabled={opt.disabled}
                                        onClick={() => handleSelect(opt.value)}
                                        className={cn(
                                            'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                                            opt.disabled ? 'cursor-not-allowed opacity-45' : 'hover:bg-accent hover:text-accent-foreground',
                                            opt.value === value && 'font-medium',
                                        )}
                                    >
                                        {hasIcons && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{opt.icon}</span>}
                                        <span className="flex-1 truncate">{opt.label}</span>
                                        {opt.note && <span className="text-muted-foreground shrink-0 text-[11px]">{opt.note}</span>}
                                        {opt.value === value && <Check className="text-brand ml-2 h-4 w-4 shrink-0" />}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}
