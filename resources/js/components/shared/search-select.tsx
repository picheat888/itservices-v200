import { cn } from '@/lib/utils';
import type { SelectOption } from '@/lib/locale-data';
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
    top: number;
    left: number;
    width: number;
}

/** Dropdown with an inline search box, rendered as a portal so it is never clipped by parent overflow. */
export function SearchSelect({ value, onChange, options, placeholder, className }: SearchSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [rect, setRect] = useState<DropdownRect>({ top: 0, left: 0, width: 0 });
    const triggerRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const selected = options.find((o) => o.value === value);

    const filtered =
        query === ''
            ? options
            : options.filter(
                  (o) =>
                      o.label.toLowerCase().includes(query.toLowerCase()) ||
                      o.value.toLowerCase().includes(query.toLowerCase()),
              );

    const handleOpen = () => {
        if (triggerRef.current) {
            const r = triggerRef.current.getBoundingClientRect();
            setRect({ top: r.bottom + 4, left: r.left, width: r.width });
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

    return (
        <>
            {/* Trigger — stays in normal document flow */}
            <button
                ref={triggerRef}
                type="button"
                onClick={handleOpen}
                className={cn(
                    'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm',
                    'ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    !selected && 'text-muted-foreground',
                    className,
                )}
            >
                <span className="truncate">{selected ? selected.label : (placeholder ?? 'Select…')}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </button>

            {/* Dropdown rendered at document.body to escape any overflow:hidden ancestor */}
            {open &&
                createPortal(
                    <div
                        id="search-select-portal"
                        style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 9999 }}
                        className="rounded-md border bg-popover shadow-md"
                    >
                        {/* Search row */}
                        <div className="flex items-center border-b px-3">
                            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Escape' && handleClose()}
                                className="flex h-10 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
                                placeholder="Search…"
                            />
                        </div>

                        {/* Options list */}
                        <div className="max-h-56 overflow-y-auto py-1">
                            {filtered.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
                            ) : (
                                filtered.map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => handleSelect(opt.value)}
                                        className={cn(
                                            'flex w-full items-center justify-between px-3 py-2 text-sm',
                                            'hover:bg-accent hover:text-accent-foreground',
                                            opt.value === value && 'font-medium',
                                        )}
                                    >
                                        <span className="truncate">{opt.label}</span>
                                        {opt.value === value && (
                                            <Check className="ml-2 h-4 w-4 shrink-0 text-brand" />
                                        )}
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
