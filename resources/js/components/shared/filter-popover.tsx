import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * FilterPopover — a "Filters" trigger button with an active-count badge that
 * opens a small floating panel. Keeps crowded filter controls out of the toolbar.
 * `children` receives a `close` callback so the panel can dismiss itself.
 */
export function FilterPopover({ count, children }: { count: number; children: (close: () => void) => ReactNode }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        window.addEventListener('mousedown', onDown);
        return () => window.removeEventListener('mousedown', onDown);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    'flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
                    count > 0 ? 'border-brand/50 bg-brand/5 text-brand' : 'border-input hover:bg-accent',
                )}
            >
                <SlidersHorizontal className="h-4 w-4" />
                {t('filters')}
                {count > 0 && (
                    <span className="bg-brand text-brand-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold">
                        {count}
                    </span>
                )}
            </button>
            {open && (
                <div className="border-border bg-popover absolute left-0 z-50 mt-1 w-72 rounded-lg border p-3 shadow-md">
                    {children(() => setOpen(false))}
                </div>
            )}
        </div>
    );
}
