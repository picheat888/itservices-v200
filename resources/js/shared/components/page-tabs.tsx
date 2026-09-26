import { cn } from '@/shared/lib/utils';

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
    return (
        <div role="tablist" className={cn('border-border flex flex-wrap gap-1 border-b px-2', className)}>
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
                            'relative inline-flex items-center gap-1.5 rounded-t-lg px-4 py-3 text-sm font-semibold transition-colors',
                            selected ? 'text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                    >
                        {tb.label}
                        {tb.count != null && tb.count > 0 && (
                            <span title={tb.countTitle} className={cn('rounded-full px-1.5 py-0.5 font-mono text-[11px]', TONES[tb.tone ?? 'muted'])}>
                                {tb.count.toLocaleString('en-US')}
                            </span>
                        )}
                        {selected && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
                    </button>
                );
            })}
        </div>
    );
}
