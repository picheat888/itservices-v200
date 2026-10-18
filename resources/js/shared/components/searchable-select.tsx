import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { UserAvatar } from '@/shared/components/user-avatar';
import { usePresence } from '@/shared/hooks/use-presence';
import { matchesAllWords, searchLabel } from '@/shared/lib/search-words';
import { cn } from '@/shared/lib/utils';
import { ChevronsUpDown, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SearchOption {
    value: string;
    label: string;
    /** Right-aligned tag (e.g. a code or on-hand qty). */
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
    searchPlaceholder,
    clearable = false,
    active = false,
    preferDown = false,
    maxRows,
    onSearch,
    onOpenChange,
    loading = false,
    selectedOption,
    id,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedBy,
    'aria-required': ariaRequired,
}: {
    value: string;
    onChange: (v: string) => void;
    options: SearchOption[];
    placeholder?: string;
    /** What the search box in the menu looks in; also its accessible name. */
    searchPlaceholder?: string;
    /** Show an inline clear (×) button when a value is selected. */
    clearable?: boolean;
    /** Brand-tinted trigger — marks a filter field whose value differs from its default. */
    active?: boolean;
    /** Measure drop direction against the viewport instead of the enclosing dialog, so a field
     *  near a small dialog's footer opens DOWN (overflowing the dialog) rather than flipping up. */
    preferDown?: boolean;
    /** Show at most this many options before the list scrolls. */
    maxRows?: number;
    /** Async mode: the parent supplies already-filtered options for the typed text, so none are filtered here. */
    onSearch?: (query: string) => void;
    /** Async mode: told when the menu opens or closes, so the parent fetches only while it is open. */
    onOpenChange?: (open: boolean) => void;
    /** Async mode: a fetch for the typed text is in flight. */
    loading?: boolean;
    /** Async mode: shown on the trigger when the chosen value is not among the current options. */
    selectedOption?: SearchOption;
    /** Set by <Field> so its label can point here — clicking the label opens the menu. */
    id?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    'aria-required'?: boolean;
}) {
    const t = useT();
    const listId = useId();
    const [open, setOpen] = useState(false);
    const { mounted, closing } = usePresence(open);
    const [q, setQ] = useState('');
    // Keyboard-highlighted option; shown only after an arrow key so mouse use looks unchanged
    const [activeIndex, setActiveIndex] = useState(0);
    const [keyboardNav, setKeyboardNav] = useState(false);
    // Open upward when the trigger sits too close to the bottom.
    const [dropUp, setDropUp] = useState(false);
    // Option-list max height, capped to the room available so the menu is never clipped.
    const [listMaxH, setListMaxH] = useState<number>(LIST_MAX);
    const [rowsMaxH, setRowsMaxH] = useState<number | null>(null);
    // Inside a dialog the menu portals into the dialog content; outside it stays inline
    const [dialogEl, setDialogEl] = useState<HTMLElement | null>(null);
    const [coords, setCoords] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });
    const ref = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const isAsync = onSearch !== undefined;
    const selected = options.find((o) => o.value === value) ?? (selectedOption?.value === value ? selectedOption : undefined);
    const filtered = q && !isAsync ? options.filter((o) => matchesAllWords(o.search, q)) : options;
    // Reserve the leading icon slot on every row when at least one option supplies one,
    // so rows without an icon (e.g. the "All" entry) keep their labels aligned.
    const hasIcons = options.some((o) => o.icon !== undefined);
    const optionId = (index: number) => `${listId}-opt-${index}`;

    // Clear the query whenever the menu closes so a stale search never hides every option.
    useEffect(() => {
        if (!open) {
            setQ('');
            setKeyboardNav(false);
        }
    }, [open]);

    // Async mode: report the menu state and the typed text to the parent
    useEffect(() => {
        onOpenChange?.(open);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    useEffect(() => {
        onSearch?.(q);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

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

    // Escape closes only the menu; caught at window capture, ahead of the dialog's own document listener
    useEffect(() => {
        if (!open) {
            return;
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') {
                return;
            }
            const target = e.target as Node;
            if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) {
                return;
            }
            e.stopPropagation();
            e.preventDefault();
            setOpen(false);
            triggerRef.current?.focus();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open]);

    // maxRows: cap the list at the height of its first N options, measured as rendered
    useLayoutEffect(() => {
        if (!open || !maxRows) {
            return;
        }
        const list = document.getElementById(listId);
        const rows = list?.querySelectorAll<HTMLElement>('[role="option"]');
        if (!list || !rows || rows.length <= maxRows) {
            setRowsMaxH(null);
            return;
        }
        // Row span plus the list's py-1, in layout px (unaffected by scroll or the dialog's zoom-in)
        const last = rows[maxRows - 1];
        setRowsMaxH(last.offsetTop + last.offsetHeight - rows[0].offsetTop + 8);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, maxRows, filtered.length]);

    // Keep the keyboard-highlighted option in view
    useEffect(() => {
        if (open && keyboardNav) {
            document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex, keyboardNav, open]);

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
        // Measure against the dialog box, or the viewport with `preferDown`
        const measureDlg = c && !preferDown ? c : null;
        const topLimit = measureDlg ? measureDlg.top : 0;
        const bottomLimit = measureDlg ? measureDlg.bottom : window.innerHeight;
        const spaceBelow = bottomLimit - rect.bottom;
        const spaceAbove = rect.top - topLimit;
        // Room the list needs: maxRows rows (avatar rows are taller), else the default threshold
        const rowEstimate = options.some((o) => o.avatar !== undefined) ? 52 : 37;
        const needed = maxRows ? maxRows * rowEstimate + LIST_CHROME + 12 : FLIP_THRESHOLD;
        // Drop down by default; flip up only when the room below is too small AND there's more above.
        const up = spaceBelow < needed && spaceAbove > spaceBelow;
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
            setActiveIndex(
                Math.max(
                    0,
                    options.findIndex((o) => o.value === value),
                ),
            );
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

    const choose = (option: SearchOption) => {
        onChange(option.value);
        setOpen(false);
        setQ('');
        triggerRef.current?.focus();
    };

    const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setKeyboardNav(true);
            if (filtered.length === 0) {
                return;
            }
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActiveIndex((i) => (Math.min(i, filtered.length - 1) + step + filtered.length) % filtered.length);
            return;
        }
        if (e.key === 'Enter') {
            // Keep Enter inside the menu so dialogs that submit on Enter don't save mid-filter
            e.stopPropagation();
            e.preventDefault();
            const option = filtered[Math.min(activeIndex, filtered.length - 1)];
            if (option && !(isAsync && loading) && (keyboardNav || q)) {
                choose(option);
            }
            return;
        }
        if (e.key === 'Tab') {
            // Hand focus back to the trigger; the browser's Tab then moves on from there
            setOpen(false);
            triggerRef.current?.focus();
        }
    };

    const activeOption = keyboardNav || q ? Math.min(activeIndex, filtered.length - 1) : -1;

    // The menu body — shared between the inline and portaled wrappers.
    const menu = (
        <>
            <div className="border-border border-b p-2">
                <input
                    name="search"
                    autoFocus
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setActiveIndex(0);
                    }}
                    onKeyDown={onSearchKeyDown}
                    role="combobox"
                    aria-expanded
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeOption >= 0 ? optionId(activeOption) : undefined}
                    aria-label={searchLabel(searchPlaceholder ?? t('search_placeholder_short'))}
                    placeholder={searchPlaceholder ?? t('search_placeholder_short')}
                    className="w-full bg-transparent px-1 text-sm text-ellipsis outline-none"
                />
            </div>
            <div
                id={listId}
                role="listbox"
                className="overflow-y-auto py-1"
                style={{ maxHeight: rowsMaxH ? Math.min(listMaxH, rowsMaxH) : listMaxH }}
            >
                {isAsync && loading && filtered.length === 0 && (
                    <div className="space-y-2 px-3 py-2" aria-busy>
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="flex items-center gap-2.5">
                                <div className="bg-muted h-7 w-7 shrink-0 animate-pulse rounded-full" />
                                <div className="bg-muted h-4 w-3/5 animate-pulse rounded" />
                            </div>
                        ))}
                    </div>
                )}
                {!(isAsync && loading) && filtered.length === 0 && q !== '' && (
                    <EmptyState
                        kind="search"
                        title={t('cmn_empty_searchable_select')}
                        hint={t('cmn_empty_searchable_select_hint')}
                        className="min-h-0 py-3"
                    />
                )}
                {!(isAsync && loading) && filtered.length === 0 && q === '' && (
                    <div className="text-muted-foreground px-3 py-4 text-center text-sm">—</div>
                )}
                {filtered.map((o, index) => (
                    <button
                        key={o.value}
                        id={optionId(index)}
                        type="button"
                        role="option"
                        aria-selected={o.value === value}
                        tabIndex={-1}
                        onClick={() => choose(o)}
                        onMouseMove={() => {
                            if (keyboardNav) {
                                setKeyboardNav(false);
                            }
                            setActiveIndex(index);
                        }}
                        className={cn(
                            'hover:bg-accent flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm',
                            o.value === value && 'bg-accent/60',
                            keyboardNav && index === activeOption && 'bg-accent',
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
                        {o.sub && <span className="text-muted-foreground shrink-0 text-xs">{o.sub}</span>}
                    </button>
                ))}
            </div>
        </>
    );

    const showClear = clearable && !!selected;

    return (
        <div ref={ref} className="relative min-w-0">
            <button
                ref={triggerRef}
                id={id}
                type="button"
                role="combobox"
                onClick={toggle}
                onKeyDown={(e) => {
                    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                        e.preventDefault();
                        toggle();
                    }
                }}
                aria-invalid={ariaInvalid}
                aria-describedby={ariaDescribedBy}
                aria-required={ariaRequired}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                className={cn(
                    'focus-visible:border-brand focus-visible:ring-brand/15 flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-3 text-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-hidden',
                    active ? 'border-brand/50 bg-brand/5 text-brand font-medium' : 'border-input bg-background hover:border-brand/50',
                    // Keep the brand border + soft ring latched while the panel is open (focus moves into the filter box).
                    open && 'border-brand ring-brand/15 ring-[3px]',
                )}
            >
                <span className="flex min-w-0 items-center gap-2">
                    {/* Avatar slot renders only for option sets that supply the field (e.g. people pickers). */}
                    {selected && selected.avatar !== undefined && (
                        <UserAvatar name={selected.label} photoUrl={selected.avatar} className="h-6 w-6 shrink-0" textClassName="text-[10px]" />
                    )}
                    {/* Leading icon of the selected option (e.g. type icon / status dot). */}
                    {selected?.icon !== undefined && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{selected.icon}</span>}
                    {/* Label truncates (full text in title); the sub stays pinned */}
                    <span title={selected?.label} className={cn('min-w-0 truncate', !selected && 'text-muted-foreground')}>
                        {selected ? selected.label : (placeholder ?? t('select_placeholder'))}
                    </span>
                    {selected?.sub && <span className="text-muted-foreground shrink-0 text-xs">{selected.sub}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                    {/* Room for the clear button, which sits over the trigger as its own control */}
                    {showClear && <span className="w-6" aria-hidden />}
                    <ChevronsUpDown className="text-muted-foreground h-4 w-4" />
                </span>
            </button>
            {showClear && (
                <button
                    type="button"
                    aria-label={t('clear')}
                    onClick={() => {
                        onChange('');
                        triggerRef.current?.focus();
                    }}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-brand/40 absolute top-1/2 right-8 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-hidden"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            )}
            {mounted &&
                (dialogEl ? (
                    // Portaled into the dialog content: escapes the body's overflow clip, stays in Radix's layer
                    createPortal(
                        <div
                            ref={menuRef}
                            style={{
                                position: 'absolute',
                                left: coords.left,
                                // Trigger width is a floor, so a narrow column doesn't cut option labels
                                minWidth: coords.width,
                                maxWidth: 320,
                                width: 'max-content',
                                top: coords.top,
                                bottom: coords.bottom,
                                zIndex: 50,
                            }}
                            className={cn(
                                'border-border bg-popover overflow-hidden rounded-md border shadow-md',
                                coords.bottom !== undefined ? 'origin-bottom' : 'origin-top',
                                closing ? 'motion-pop-out' : 'motion-pop-in',
                            )}
                        >
                            {menu}
                        </div>,
                        dialogEl,
                    )
                ) : (
                    <div
                        ref={menuRef}
                        className={cn(
                            'border-border bg-popover absolute z-50 w-max max-w-[320px] min-w-full overflow-hidden rounded-md border shadow-md',
                            dropUp ? 'bottom-full mb-1 origin-bottom' : 'top-full mt-1 origin-top',
                            closing ? 'motion-pop-out' : 'motion-pop-in',
                        )}
                    >
                        {menu}
                    </div>
                ))}
        </div>
    );
}
