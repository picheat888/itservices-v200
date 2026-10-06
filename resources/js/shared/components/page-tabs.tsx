import { cn } from '@/shared/lib/utils';
import { useEffect, useRef } from 'react';

export interface PageTab<T extends string> {
    id: T;
    label: string;
    /** Optional count pill after the label — hidden when null/0. */
    count?: number | null;
    /**
     * What the count means, which sets its colour: `alert` = work waiting on somebody (red),
     * `warn` = something to look at (amber), `muted` = a plain total (grey, the default).
     */
    tone?: 'alert' | 'warn' | 'muted';
    /** Tooltip on the count pill. */
    countTitle?: string;
}

const TONES: Record<NonNullable<PageTab<string>['tone']>, string> = {
    alert: 'bg-red-100 font-semibold text-red-600 dark:bg-red-950/50 dark:text-red-400',
    warn: 'bg-amber-500/15 font-semibold text-amber-600 dark:text-amber-400',
    muted: 'bg-accent text-muted-foreground',
};

/**
 * The tab bar at the top of every Workspace module page (Tickets, Requests, Employees, Assets,
 * Contracts, Stock, Access). One look for all of them, and the same one the focus dialogs use
 * (DialogTabs): the active tab is brand-coloured with an underline inset by the same amount
 * on every tab, so a short label and a long one read as the same kind of control.
 */
export function PageTabs<T extends string>({
    tabs,
    active,
    onChange,
    className,
}: {
    tabs: PageTab<T>[];
    active: T;
    onChange: (id: T) => void;
    className?: string;
}) {
    // One row that scrolls sideways when it runs out of room (a tablet in portrait), rather
    // than wrapping into a second row that reads as a second set of tabs. The active tab is
    // kept in view, so a deep link to the last tab doesn't open on a tab you can't see.
    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const tab = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
        tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [active]);

    return (
        <div
            ref={listRef}
            role="tablist"
            className={cn('border-border flex gap-1 overflow-x-auto border-b px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
        >
            {tabs.map((tb) => {
                const selected = active === tb.id;
                return (
                    <button
                        key={tb.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => onChange(tb.id)}
                        className={cn(
                            'relative inline-flex shrink-0 items-center gap-1.5 rounded-t-lg px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors',
                            selected ? 'text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                    >
                        {tb.label}
                        {tb.count != null && tb.count > 0 && (
                            <span title={tb.countTitle} className={cn('rounded-full px-1.5 py-0.5 font-mono text-[11px]', TONES[tb.tone ?? 'muted'])}>
                                {tb.count.toLocaleString('en-US')}
                            </span>
                        )}
                        {/* bottom-0, not -bottom-px: the strip scrolls, so anything below its edge is clipped. */}
                        {selected && <span className="bg-brand absolute inset-x-2 bottom-0 h-0.5 rounded-full" />}
                    </button>
                );
            })}
        </div>
    );
}
