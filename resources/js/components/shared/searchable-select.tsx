import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ChevronsUpDown, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        window.addEventListener('mousedown', h);
        return () => window.removeEventListener('mousedown', h);
    }, []);

    // Decide the open direction at click time: if there isn't room below for the
    // menu (e.g. the last field in a dialog) and there's more room above, drop up
    // so the list never spills past the screen edge.
    const toggle = () => {
        setOpen((o) => {
            const next = !o;
            if (next && ref.current) {
                const rect = ref.current.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                const MENU_MAX = 300; // search box + max-h-56 list + padding
                setDropUp(spaceBelow < MENU_MAX && rect.top > spaceBelow);
            }
            return next;
        });
    };

    const selected = options.find((o) => o.value === value);
    const filtered = q ? options.filter((o) => o.search.toLowerCase().includes(q.toLowerCase())) : options;

    return (
        <div ref={ref} className="relative min-w-0">
            <button
                type="button"
                onClick={toggle}
                className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
                <span className="flex min-w-0 items-center gap-2">
                    {/* Avatar slot renders only for option sets that supply the field (e.g. people pickers). */}
                    {selected && selected.avatar !== undefined && (
                        <Avatar className="h-6 w-6 shrink-0">
                            {selected.avatar && <AvatarImage src={selected.avatar} alt="" />}
                            <AvatarFallback className="bg-brand/10 text-[10px] font-semibold text-brand">
                                {optionInitials(selected.label)}
                            </AvatarFallback>
                        </Avatar>
                    )}
                    {/* Label truncates; the sub (e.g. on-hand qty) stays pinned so it never gets cut. */}
                    <span className={cn('min-w-0 truncate', !selected && 'text-muted-foreground')}>
                        {selected ? selected.label : placeholder ?? t('select_placeholder')}
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
                            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </span>
                    )}
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                </span>
            </button>
            {open && (
                <div
                    className={cn(
                        'absolute z-50 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md',
                        dropUp ? 'bottom-full mb-1' : 'top-full mt-1',
                    )}
                >
                    <div className="border-b border-border p-2">
                        <input
                            autoFocus
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder={t('search_placeholder_short')}
                            className="w-full bg-transparent px-1 text-sm outline-none"
                        />
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                        {filtered.length === 0 && <div className="px-3 py-4 text-center text-sm text-muted-foreground">—</div>}
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
                                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent',
                                    o.value === value && 'bg-accent/60',
                                )}
                            >
                                {o.avatar !== undefined && (
                                    <Avatar className="h-7 w-7 shrink-0">
                                        {o.avatar && <AvatarImage src={o.avatar} alt="" />}
                                        <AvatarFallback className="bg-brand/10 text-[10px] font-semibold text-brand">
                                            {optionInitials(o.label)}
                                        </AvatarFallback>
                                    </Avatar>
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate">{o.label}</span>
                                    {o.hint && <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>}
                                </span>
                                {o.sub && <span className="shrink-0 font-mono text-xs text-muted-foreground">{o.sub}</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
