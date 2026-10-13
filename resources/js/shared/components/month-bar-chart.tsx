import { useT } from '@/lang';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { cn } from '@/shared/lib/utils';

/** One column of the chart. `month` is the column's start: 'YYYY-MM-DD' (day, week), 'YYYY-MM' or 'YYYY'. */
export interface MonthBar {
    month: string;
    count: number;
}

/**
 * Vertical bar chart over a fixed run of months, oldest on the left. The last column is the
 * one being lived through, so it is drawn in solid brand while the closed months behind it
 * fade back — a reader should not compare a half-finished month against whole ones without
 * noticing. Counts sit above their bar; the year rides under the month name because the
 * window crosses a new year twice a year.
 *
 * Deliberately hand-rolled: twelve bars need no scales, axes or tooltips, and a chart
 * library would have to be taught the app's brand variable and both themes to look like
 * this. Callers own the card, the title and the legend — this draws only the bars.
 */
export type BarUnit = 'day' | 'week' | 'month' | 'year';

export function MonthBarChart({
    data,
    emptyLabel,
    className,
    unit = 'month',
    highlightLast = true,
}: {
    data: MonthBar[];
    emptyLabel: string;
    className?: string;
    unit?: BarUnit;
    /** Off for a period that ended in the past: no column is the current one. */
    highlightLast?: boolean;
}) {
    const fmt = useDateFormat();
    const max = Math.max(1, ...data.map((d) => d.count));
    const lastIndex = highlightLast ? data.length - 1 : -1;
    // A run of zeroes is not a chart. Twelve empty bars read as something broken, so say
    // there is nothing instead — the caller supplies the wording for its own subject.
    const isEmpty = data.length === 0 || data.every((d) => d.count === 0);

    // Top line + the smaller one under it: day/week = day + month, month = month + 2-digit year, year = the year alone.
    const label = (start: string) => {
        const [y, , d] = start.split('-').map(Number);
        if (unit === 'year') return { mon: fmt.year(y), yy: '' };
        if (unit === 'day' || unit === 'week') return { mon: String(d), yy: fmt.month(start) };
        return { mon: fmt.month(start), yy: fmt.year(y).slice(-2) };
    };

    if (isEmpty) {
        return <div className="text-muted-foreground py-10 text-center text-sm">{emptyLabel}</div>;
    }

    return (
        <div className={cn('flex h-[172px] items-end gap-2.5 pt-[22px]', className)}>
            {data.map((d, i) => {
                const now = i === lastIndex;
                const { mon, yy } = label(d.month);
                return (
                    <div key={d.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                        <div
                            className={cn('relative w-full max-w-[32px] rounded-t-md', now ? 'bg-brand' : 'bg-brand/35')}
                            // minHeight keeps an empty month visible as a baseline tick rather
                            // than a gap the eye reads as a missing month.
                            style={{ height: `${(d.count / max) * 100}%`, minHeight: 3 }}
                        >
                            <span
                                className={cn(
                                    'absolute -top-[18px] right-0 left-0 text-center font-mono text-[11px] font-semibold',
                                    now ? 'text-brand' : 'text-muted-foreground',
                                )}
                            >
                                {d.count}
                            </span>
                        </div>
                        <div className="text-center text-[10.5px] whitespace-nowrap">
                            <b className={cn('block font-semibold', now ? 'text-brand' : 'text-foreground')}>{mon}</b>
                            <span className="text-muted-foreground tabular-nums">{yy}</span>
                        </div>
                    </div>
                );
            })}
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
