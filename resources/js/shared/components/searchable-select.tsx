import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { UserAvatar } from '@/shared/components/user-avatar';
import { ChevronsUpDown, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SearchOption {
    value: string;
    label: string;
    /** Right-aligned monospace tag (e.g. a code or on-hand qty). */
    sub?: string;
    /** Optional small pill shown before the sub (e.g. a department tag). */
    tag?: string;
    /** Optional secondary line under the label (e.g. a job title). */
    hint?: string;
    /** Optional avatar URL; when the field is present an avatar slot renders (initials fallback). */
    avatar?: string | null;
    /** Optional leading visual (e.g. a type icon or status color dot). When any option
     *  has one, every row reserves the slot so labels stay aligned. */
    icon?: React.ReactNode;
    search: string;
}

// Prefer dropping down; only flip up when there's less than this much room below.
const FLIP_THRESHOLD = 180;
// Default option-list height (matches the old max-h-56) when there's ample room.
const LIST_MAX = 224;
// Chrome outside the list (search box + paddings/borders) — reserved when capping height.
const LIST_CHROME = 56;

export function SearchableSelect({
    value,
    onChange,
    options,
    placeholder,
    clearable = false,
    active = false,
    preferDown = false,
}: {
    value: string;
    onChange: (v: string) => void;
    options: SearchOption[];
    placeholder?: string;
    /** Show an inline clear (×) button when a value is selected. */
    clearable?: boolean;
    /** Brand-tinted trigger — marks a filter field whose value differs from its default. */
    active?: boolean;
    /** Measure drop direction against the viewport instead of the enclosing dialog, so a field
     *  near a small dialog's footer opens DOWN (overflowing the dialog) rather than flipping up. */
    preferDown?: boolean;
}) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    // Open upward when the trigger sits too close to the bottom.
    const [dropUp, setDropUp] = useState(false);
    // Option-list max height, capped to the room available so the menu is never clipped.
    const [listMaxH, setListMaxH] = useState<number>(LIST_MAX);
    // When the select lives inside a dialog, the menu is portaled into the dialog
    // content (escaping the body's overflow-y-auto clip) and positioned absolutely
    // relative to it. Outside a dialog it stays inline, exactly as before.
    const [dialogEl, setDialogEl] = useState<HTMLElement | null>(null);
    const [coords, setCoords] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });
    const ref = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Clear the query whenever the menu closes, so a stale, non-matching search from a
    // previous session doesn't persist and hide every option the next time it's opened.
    useEffect(() => {
        if (!open) setQ('');
    }, [open]);

    // Close when clicking outside both the trigger and the (possibly portaled) menu.
    useEffect(() => {
        const h = (e: MouseEvent) => {
            const target = e.target as Node;
            if (ref.current?.contains(target) || menuRef.current?.contains(target)) {
                return;
            }
            setOpen(false);
        };
        window.addEventListener('mousedown', h);
        return () => window.removeEventListener('mousedown', h);
    }, []);

    // Measure the trigger and decide drop direction + portal target. When inside a
    // dialog we store coordinates relative to the dialog box for absolute placement.
    const place = () => {
        const el = ref.current;
        if (!el) {
            return;
        }
        const rect = el.getBoundingClientRect();
        const dlg = el.closest('[role="dialog"]') as HTMLElement | null;
        const c = dlg?.getBoundingClientRect();
        // Normally we decide drop direction against the dialog's box so a field near the footer
        // flips up instead of opening behind it. With `preferDown` we measure against the viewport
        // instead, so the menu opens DOWN and overflows the (small) dialog — the menu is still
        // portaled INTO the dialog content, so it stays in Radix's dismissable layer.
        const measureDlg = c && !preferDown ? c : null;
        const topLimit = measureDlg ? measureDlg.top : 0;
        const bottomLimit = measureDlg ? measureDlg.bottom : window.innerHeight;
        const spaceBelow = bottomLimit - rect.bottom;
        const spaceAbove = rect.top - topLimit;
        // Drop down by default; flip up only when the room below is too small AND there's more above.
        const up = spaceBelow < FLIP_THRESHOLD && spaceAbove > spaceBelow;
        // Cap the list to the room in the chosen direction so it never spills past the dialog/footer.
        const room = (up ? spaceAbove : spaceBelow) - LIST_CHROME - 8;
        setListMaxH(Math.max(120, Math.min(LIST_MAX, room)));
        setDropUp(up);
        setDialogEl(dlg);
        if (dlg && c) {
            setCoords({
                left: rect.left - c.left,
                width: rect.width,
                top: up ? undefined : rect.bottom - c.top + 4,
                bottom: up ? c.bottom - rect.top + 4 : undefined,
            });
        }
    };

    // Decide the open direction / placement at click time.
    const toggle = () => {
        if (!open) {
            place();
        }
        setOpen((o) => !o);
    };

    // Keep the portaled menu glued to the trigger while the dialog body scrolls or the window resizes.
    useEffect(() => {
        if (!open || !dialogEl) {
            return;
        }
        const onScroll = (e: Event) => {
            // Ignore scrolling that happens inside the menu's own option list.
            if (menuRef.current?.contains(e.target as Node)) {
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
    }, [open, dialogEl]);

    const selected = options.find((o) => o.value === value);
    const filtered = q ? options.filter((o) => o.search.toLowerCase().includes(q.toLowerCase())) : options;
    // Reserve the leading icon slot on every row when at least one option supplies one,
    // so rows without an icon (e.g. the "All" entry) keep their labels aligned.
    const hasIcons = options.some((o) => o.icon !== undefined);

    // The menu body — shared between the inline and portaled wrappers.
    const menu = (
        <>
            <div className="border-border border-b p-2">
                <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t('search_placeholder_short')}
                    className="w-full bg-transparent px-1 text-sm outline-none"
                />
            </div>
            <div className="overflow-y-auto py-1" style={{ maxHeight: listMaxH }}>
                {filtered.length === 0 && <div className="text-muted-foreground px-3 py-4 text-center text-sm">—</div>}
                {filtered.map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        onClick={() => {
                            onChange(o.value);
                            setOpen(false);
                            setQ('');
                        }}
                        className={cn(
                            'hover:bg-accent flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm',
                            o.value === value && 'bg-accent/60',
                        )}
                    >
                        {o.avatar !== undefined && (
                            <UserAvatar name={o.label} photoUrl={o.avatar} className="h-7 w-7 shrink-0" textClassName="text-[10px]" />
                        )}
                        {hasIcons && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{o.icon}</span>}
                        <span className="min-w-0 flex-1">
                            <span className="block truncate">{o.label}</span>
                            {o.hint && <span className="text-muted-foreground block truncate text-xs">{o.hint}</span>}
                        </span>
                        {o.tag && (
                            <span className="bg-accent text-muted-foreground max-w-[110px] shrink-0 truncate rounded px-1.5 py-0.5 text-[10px] font-medium">
                                {o.tag}
                            </span>
                        )}
                        {o.sub && <span className="text-muted-foreground shrink-0 font-mono text-xs">{o.sub}</span>}
                    </button>
                ))}
            </div>
        </>
    );

    return (
        <div ref={ref} className="relative min-w-0">
            <button
                type="button"
                onClick={toggle}
                className={cn(
                    'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-sm transition-colors focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/15 focus-visible:outline-hidden',
                    active ? 'border-brand/50 bg-brand/5 text-brand font-medium' : 'border-input bg-background hover:border-brand/50',
                )}
            >
                <span className="flex min-w-0 items-center gap-2">
                    {/* Avatar slot renders only for option sets that supply the field (e.g. people pickers). */}
                    {selected && selected.avatar !== undefined && (
                        <UserAvatar name={selected.label} photoUrl={selected.avatar} className="h-6 w-6 shrink-0" textClassName="text-[10px]" />
                    )}
                    {/* Leading icon of the selected option (e.g. type icon / status dot). */}
                    {selected?.icon !== undefined && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{selected.icon}</span>}
                    {/* Label truncates; the sub (e.g. on-hand qty) stays pinned so it never gets cut. */}
                    <span className={cn('min-w-0 truncate', !selected && 'text-muted-foreground')}>
                        {selected ? selected.label : (placeholder ?? t('select_placeholder'))}
                    </span>
                    {selected?.sub && <span className="text-muted-foreground shrink-0 font-mono text-xs">{selected.sub}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                    {clearable && selected && (
                        <span
                            role="button"
                            tabIndex={-1}
                            aria-label={t('clear')}
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange('');
                            }}
                            className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-5 w-5 items-center justify-center rounded"
                        >
                            <X className="h-3.5 w-3.5" />
                        </span>
                    )}
                    <ChevronsUpDown className="text-muted-foreground h-4 w-4" />
                </span>
            </button>
            {open &&
                (dialogEl ? (
                    // Portaled into the dialog content → escapes the dialog body's overflow clip,
                    // yet stays inside Radix's focus scope / dismissable layer.
                    createPortal(
                        <div
                            ref={menuRef}
                            style={{
                                position: 'absolute',
                                left: coords.left,
                                width: coords.width,
                                top: coords.top,
                                bottom: coords.bottom,
                                zIndex: 50,
                            }}
                            className="border-border bg-popover overflow-hidden rounded-md border shadow-md"
                        >
                            {menu}
                        </div>,
                        dialogEl,
                    )
                ) : (
                    <div
                        ref={menuRef}
                        className={cn(
                            'border-border bg-popover absolute z-50 w-full overflow-hidden rounded-md border shadow-md',
                            dropUp ? 'bottom-full mb-1' : 'top-full mt-1',
                        )}
                    >
                        {menu}
                    </div>
                ))}
        </div>
    );
}
