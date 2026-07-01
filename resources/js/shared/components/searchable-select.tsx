import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { ChevronsUpDown, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SearchOption {
    value: string;
    label: string;
    /** Right-aligned monospace tag (e.g. a code or on-hand qty). */
    sub?: string;
    /** Optional secondary line under the label (e.g. a job title). */
    hint?: string;
    /** Optional avatar URL; when the field is present an avatar slot renders (initials fallback). */
    avatar?: string | null;
    search: string;
}

/** First two initials of a label, for the avatar fallback. */
function optionInitials(label: string): string {
    return label
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

// Approx. menu height (search box + max-h-56 list + padding) used to decide drop direction.
const MENU_MAX = 300;

export function SearchableSelect({
    value,
    onChange,
    options,
    placeholder,
    clearable = false,
}: {
    value: string;
    onChange: (v: string) => void;
    options: SearchOption[];
    placeholder?: string;
    /** Show an inline clear (×) button when a value is selected. */
    clearable?: boolean;
}) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    // Open upward when the trigger sits too close to the viewport bottom.
    const [dropUp, setDropUp] = useState(false);
    // When the select lives inside a dialog, the menu is portaled into the dialog
    // content (escaping the body's overflow-y-auto clip) and positioned absolutely
    // relative to it. Outside a dialog it stays inline, exactly as before.
    const [dialogEl, setDialogEl] = useState<HTMLElement | null>(null);
    const [coords, setCoords] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });
    const ref = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

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
        const spaceBelow = window.innerHeight - rect.bottom;
        const up = spaceBelow < MENU_MAX && rect.top > spaceBelow;
        const dlg = el.closest('[role="dialog"]') as HTMLElement | null;
        setDropUp(up);
        setDialogEl(dlg);
        if (dlg) {
            const c = dlg.getBoundingClientRect();
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
            <div className="max-h-56 overflow-y-auto py-1">
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
                            <Avatar className="h-7 w-7 shrink-0">
                                {o.avatar && <AvatarImage src={o.avatar} alt="" />}
                                <AvatarFallback className="bg-brand/10 text-brand text-[10px] font-semibold">
                                    {optionInitials(o.label)}
                                </AvatarFallback>
                            </Avatar>
                        )}
                        <span className="min-w-0 flex-1">
                            <span className="block truncate">{o.label}</span>
                            {o.hint && <span className="text-muted-foreground block truncate text-xs">{o.hint}</span>}
                        </span>
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
                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
            >
                <span className="flex min-w-0 items-center gap-2">
                    {/* Avatar slot renders only for option sets that supply the field (e.g. people pickers). */}
                    {selected && selected.avatar !== undefined && (
                        <Avatar className="h-6 w-6 shrink-0">
                            {selected.avatar && <AvatarImage src={selected.avatar} alt="" />}
                            <AvatarFallback className="bg-brand/10 text-brand text-[10px] font-semibold">
                                {optionInitials(selected.label)}
                            </AvatarFallback>
                        </Avatar>
                    )}
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
