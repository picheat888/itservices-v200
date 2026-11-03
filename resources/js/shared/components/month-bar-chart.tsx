import { useT } from '@/lang';
import { EmptyState, type EmptyStateProps } from '@/shared/components/empty-state';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { countAxis } from '@/shared/lib/count-axis';
import { cn } from '@/shared/lib/utils';

/** One column of the chart. `month` is the column's start: 'YYYY-MM-DD' (day, week), 'YYYY-MM' or 'YYYY'. */
export interface MonthBar {
    month: string;
    count: number;
}

/** Vertical bar chart over a run of months, oldest left; the current column is solid brand. Draws only the bars. */
export type BarUnit = 'day' | 'week' | 'month' | 'year';

export function MonthBarChart({
    data,
    empty,
    className,
    unit = 'month',
    highlightLast = true,
    guides = false,
}: {
    data: MonthBar[];
    /** Shared empty state shown when every column is zero. */
    empty: EmptyStateProps;
    className?: string;
    unit?: BarUnit;
    /** Off for a period that ended in the past: no column is the current one. */
    highlightLast?: boolean;
    /** Horizontal guide lines at rounded counts, numbered on the left. */
    guides?: boolean;
}) {
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const peak = Math.max(1, ...data.map((d) => d.count));
    const axis = countAxis(peak);
    const max = guides ? axis.top : peak;
    const lineAt = (value: number) => `${(1 - value / axis.top) * 100}%`;
    const lastIndex = highlightLast ? data.length - 1 : -1;
    // All zeroes shows the caller's empty state instead of empty bars
    const isEmpty = data.length === 0 || data.every((d) => d.count === 0);

    // Top line + the smaller one under it: day/week = day + month, month = month + 2-digit year, year = the year alone.
    const label = (start: string) => {
        const [y, , d] = start.split('-').map(Number);
        if (unit === 'year') return { mon: fmt.year(y), yy: '' };
        if (unit === 'day' || unit === 'week') return { mon: String(d), yy: fmt.month(start) };
        return { mon: fmt.month(start), yy: fmt.year(y).slice(-2) };
    };

    if (isEmpty) return <EmptyState {...empty} />;

    return (
        <div className={cn('flex h-[172px] gap-2.5 pt-[22px]', className)}>
            {/* Axis numbers, as wide as the top one */}
            {guides && (
                <div className="text-muted-foreground relative h-28 shrink-0 text-right text-[10.5px] leading-none tabular-nums" aria-hidden>
                    <span className="invisible block">{fmtN(axis.top)}</span>
                    {axis.ticks.map((tick) => (
                        <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: lineAt(tick) }}>
                            {fmtN(tick)}
                        </span>
                    ))}
                </div>
            )}

            <div className="min-w-0 flex-1">
                <div className="relative h-28">
                    {guides &&
                        axis.ticks.map((tick) => (
                            <div
                                key={tick}
                                aria-hidden
                                className={cn('absolute inset-x-0 border-t', tick === 0 ? 'border-input' : 'border-border')}
                                style={{ top: lineAt(tick) }}
                            />
                        ))}
                    <div className="absolute inset-0 flex items-end gap-2.5">
                        {data.map((d, i) => {
                            const now = i === lastIndex;
                            return (
                                <div key={d.month} className="flex h-full flex-1 items-end justify-center">
                                    <div
                                        // min-h keeps an empty month visible as a baseline tick
                                        className={cn('relative min-h-[3px] w-full max-w-[32px] rounded-t-md', now ? 'bg-brand' : 'bg-brand/35')}
                                        style={{ height: `${(d.count / max) * 100}%` }}
                                    >
                                        <span
                                            className={cn(
                                                'absolute -top-[18px] right-0 left-0 text-center text-[11px] font-semibold',
                                                now ? 'text-brand' : 'text-muted-foreground',
                                            )}
                                        >
                                            {fmtN(d.count)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Column labels */}
                <div className="mt-1.5 flex gap-2.5">
                    {data.map((d, i) => {
                        const now = i === lastIndex;
                        const { mon, yy } = label(d.month);
                        return (
                            <div key={d.month} className="flex-1 text-center text-[10.5px] whitespace-nowrap">
                                <b className={cn('block font-semibold', now ? 'text-brand' : 'text-foreground')}>{mon}</b>
                                <span className="text-muted-foreground tabular-nums">{yy}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/** Legend swatch naming what the solid brand bar means, for cards that need to say it. */
export function CurrentMonthLegend() {
    const t = useT();
    return (
        <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-[11.5px]">
            <i className="bg-brand h-2.5 w-2.5 rounded-[3px]" />
            {t('current_month')}
        </span>
    );
}
