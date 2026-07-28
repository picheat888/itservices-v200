import { ICON_OPTIONS, getLucideIcon } from '@/shared/lib/lucide-icons';
import { cn } from '@/shared/lib/utils';
import { ChevronsUpDown, X } from 'lucide-react';
import { useMemo, useState } from 'react';

/**
 * IconPicker — pick a Lucide icon by name from the curated ICON_OPTIONS set.
 * Stores the icon's name string (e.g. "Laptop"); pass it back as `value`.
 */
export function IconPicker({
    value,
    onChange,
    placeholder = 'เลือกไอคอน',
}: {
    value?: string | null;
    onChange: (name: string | null) => void;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const Current = getLucideIcon(value);

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return needle ? ICON_OPTIONS.filter((o) => o.name.toLowerCase().includes(needle)) : ICON_OPTIONS;
    }, [q]);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="border-input focus:border-brand bg-background flex h-10 w-full items-center gap-2 rounded-md border px-3 text-sm outline-none"
            >
                {Current ? (
                    <>
                        <Current className="h-4 w-4 shrink-0" />
                        <span className="truncate">{value}</span>
                    </>
                ) : (
                    <span className="text-muted-foreground">{placeholder}</span>
                )}
                <span className="ml-auto flex items-center gap-1">
                    {value && (
                        <span
                            role="button"
                            tabIndex={0}
                            aria-label="clear"
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
                            placeholder="ค้นหาไอคอน…"
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
                            {filtered.length === 0 && <div className="text-muted-foreground col-span-8 py-4 text-center text-xs">ไม่พบไอคอน</div>}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
