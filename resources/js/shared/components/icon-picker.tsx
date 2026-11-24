import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { ICON_OPTIONS, getLucideIcon } from '@/shared/lib/lucide-icons';
import { matchesAllWords, searchLabel } from '@/shared/lib/search-words';
import { cn } from '@/shared/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { ChevronsUpDown, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * IconPicker — pick a Lucide icon by name from the curated ICON_OPTIONS set.
 * Stores the icon's name string (e.g. "Laptop"); pass it back as `value`.
 * Inside a modal dialog the list portals into the dialog content, so it floats over the
 * dialog body instead of being clipped by its scroll area.
 */
export function IconPicker({
    id,
    value,
    onChange,
    placeholder,
    'aria-describedby': describedBy,
}: {
    id?: string;
    value?: string | null;
    onChange: (name: string | null) => void;
    placeholder?: string;
    'aria-describedby'?: string;
}) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [container, setContainer] = useState<HTMLElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const Current = getLucideIcon(value);

    const filtered = useMemo(() => {
        return ICON_OPTIONS.filter((o) => matchesAllWords(o.name, q));
    }, [q]);

    const handleOpenChange = (next: boolean) => {
        if (next) {
            setContainer((triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? null);
        }
        setOpen(next);
    };

    // Escape closes the list only, not the dialog behind it
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            setOpen(false);
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [open]);

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <button
                    ref={triggerRef}
                    id={id}
                    type="button"
                    aria-describedby={describedBy}
                    className="border-input focus:border-brand bg-background flex h-10 w-full items-center gap-2 rounded-md border px-3 text-sm outline-none"
                >
                    {Current ? (
                        <>
                            <Current className="h-4 w-4 shrink-0" />
                            <span className="truncate">{value}</span>
                        </>
                    ) : (
                        <span className="text-muted-foreground">{placeholder ?? t('icon_pick')}</span>
                    )}
                    <span className="ml-auto flex items-center gap-1">
                        {value && (
                            <span
                                role="button"
                                tabIndex={0}
                                aria-label={t('clear')}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange(null);
                                }}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-3.5 w-3.5" />
                            </span>
                        )}
                        <ChevronsUpDown className="text-muted-foreground h-4 w-4" />
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent container={container} align="start" collisionPadding={16} className="w-[var(--radix-popover-trigger-width)] p-2">
                <input
                    name="icon_search"
                    autoComplete="off"
                    spellCheck={false}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t('icon_search')}
                    aria-label={searchLabel(t('icon_search'))}
                    className="border-input focus:border-brand bg-background mb-2 h-8 w-full rounded-md border px-2 text-sm outline-none"
                />
                <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto">
                    {filtered.map(({ name, Icon }) => (
                        <button
                            key={name}
                            type="button"
                            title={name}
                            onClick={() => {
                                onChange(name);
                                setOpen(false);
                                setQ('');
                            }}
                            className={cn(
                                'hover:bg-accent flex h-8 w-8 items-center justify-center rounded',
                                value === name && 'bg-brand/10 text-brand',
                            )}
                        >
                            <Icon className="h-4 w-4" />
                        </button>
                    ))}
                    {filtered.length === 0 && (
                        <EmptyState
                            kind="search"
                            title={t('cmn_empty_icon_picker')}
                            hint={t('cmn_empty_icon_picker_hint')}
                            className="col-span-8 min-h-0 py-4"
                        />
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
