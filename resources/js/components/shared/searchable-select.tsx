import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ChevronsUpDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface SearchOption {
    value: string;
    label: string;
    sub?: string;
    search: string;
}

export function SearchableSelect({
    value,
    onChange,
    options,
    placeholder,
}: {
    value: string;
    onChange: (v: string) => void;
    options: SearchOption[];
    placeholder?: string;
}) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        window.addEventListener('mousedown', h);
        return () => window.removeEventListener('mousedown', h);
    }, []);

    const selected = options.find((o) => o.value === value);
    const filtered = q ? options.filter((o) => o.search.toLowerCase().includes(q.toLowerCase())) : options;

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
                <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected ? selected.label : placeholder ?? t('select_placeholder')}</span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
            {open && (
                <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
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
                                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent',
                                    o.value === value && 'bg-accent/60',
                                )}
                            >
                                <span className="truncate">{o.label}</span>
                                {o.sub && <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{o.sub}</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
