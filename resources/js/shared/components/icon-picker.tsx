import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { ICON_OPTIONS, getLucideIcon } from '@/shared/lib/lucide-icons';
import { matchesAllWords, searchLabel } from '@/shared/lib/search-words';
import { cn } from '@/shared/lib/utils';
import { ChevronsUpDown, X } from 'lucide-react';
import { useMemo, useState } from 'react';

/**
 * IconPicker — pick a Lucide icon by name from the curated ICON_OPTIONS set.
 * Stores the icon's name string (e.g. "Laptop"); pass it back as `value`.
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
    const Current = getLucideIcon(value);

    const filtered = useMemo(() => {
        return ICON_OPTIONS.filter((o) => matchesAllWords(o.name, q));
    }, [q]);

    return (
        <div className="relative">
            <button
                id={id}
                type="button"
                aria-describedby={describedBy}
                onClick={() => setOpen((o) => !o)}
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

            {open && (
                <>
                    {/* click-away backdrop */}
                    <button type="button" aria-hidden className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
                    <div className="bg-popover absolute z-50 mt-1 w-full rounded-md border p-2 shadow-md">
                        <input
                            autoFocus
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
                    </div>
                </>
            )}
        </div>
    );
}
