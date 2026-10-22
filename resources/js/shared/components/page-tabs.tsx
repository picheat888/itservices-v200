import { TabCount } from '@/shared/components/tab-count';
import { TabBarStatus, TabRefreshMark } from '@/shared/components/tab-refresh-mark';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import type { RefreshMark } from '@/shared/lib/refresh-mark';
import { cn } from '@/shared/lib/utils';
import { useEffect, useRef } from 'react';

export interface PageTab<T extends string> {
    id: T;
    label: string;
    /** Optional count pill after the label — hidden when null/0. */
    count?: number | null;
    /** Count colour: `alert` = work waiting on somebody (red), `warn` = something to look at (amber), `muted` = a plain total (grey, default). */
    tone?: 'alert' | 'warn' | 'muted';
    /** Tooltip on the count pill. */
    countTitle?: string;
    /** Refresh mark of the tab's data (useTabFreshness); a slot beside the label opens only while it refreshes. */
    refresh?: RefreshMark;
}

const TONES: Record<NonNullable<PageTab<string>['tone']>, string> = {
    alert: 'bg-red-100 font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-400',
    warn: 'bg-amber-500/10 font-semibold text-amber-700 dark:text-amber-400',
    muted: 'bg-accent text-foreground/65 dark:text-muted-foreground',
};

/** Tab bar of every Workspace module page, in the same look as DialogTabs (brand active tab, same-inset underline). */
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
    const fmtN = useNumberFormat();
    const hasMarks = tabs.some((tb) => tb.refresh !== undefined);
    // One row that scrolls sideways instead of wrapping; the active tab is kept in view
    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const tab = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
        tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [active]);

    return (
        <>
            {hasMarks && <TabBarStatus marks={tabs.map((tb) => tb.refresh)} />}
            <div
                ref={listRef}
                role="tablist"
                className={cn(
                    'border-border flex gap-1 overflow-x-auto border-b px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                    className,
                )}
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
                                'press focus-visible:ring-ring relative inline-flex shrink-0 items-center gap-1.5 rounded-t-lg px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
                                selected ? 'text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                            )}
                        >
                            {tb.label}
                            <TabCount
                                count={tb.count}
                                visible={tb.count != null && tb.count > 0}
                                title={tb.countTitle}
                                className={cn('rounded-full px-1.5 py-0.5 text-[11px]', TONES[tb.tone ?? 'muted'])}
                            >
                                {fmtN(tb.count ?? 0)}
                            </TabCount>
                            {/* bottom-0, not -bottom-px: the strip scrolls, so anything below its edge is clipped. */}
                            {selected && <span className="bg-brand absolute inset-x-2 bottom-0 h-0.5 rounded-full" />}
                            {tb.refresh !== undefined && <TabRefreshMark mark={tb.refresh} />}
                        </button>
                    );
                })}
            </div>
        </>
    );
}
