/**
 * The 'buckets' chart — the categories drawn as the /assets overview card "ทรัพย์สินทั้งหมดในระบบ"
 * is: each category's icon, name and total, then a bar on its own line that always fills the width,
 * split into the groups (ready / in use / written off) with each group's count over its piece — as
 * the IT staff card draws a person's split. A full bar per category keeps a single written-off
 * asset visible beside hundreds in use; the legend in the heading names the colours. Past `TOP_BUCKETS` the rest fold into one "อื่น ๆ (n)" row.
 * Drawn under the status donut by tabular-charts.tsx; SplitLegend is shared with places-card.tsx.
 */
import { useT } from '@/lang';
import { getLucideIcon } from '@/shared/lib/lucide-icons';
import { cn } from '@/shared/lib/utils';
import { Box, MoreHorizontal } from 'lucide-react';
import type { ChartSeries, TabularChart } from '../types';
import { ChartHeading, fold, FoldToggle, StackBar, useChartLabel } from './chart-parts';
import { FILL } from './chart-tones';

type Buckets = Extract<TabularChart, { type: 'buckets' }>;

/** How many categories show before the rest fold into "อื่น ๆ". */
const TOP_BUCKETS = 5;

/**
 * One line: an icon (optional) and the name, the split bar — full width, each part's count over its
 * piece — then the total, name and total level with the bar itself.
 */
export function SplitLine({
    name,
    icon: Icon,
    values,
    total,
    series,
    muted,
}: {
    name: string;
    icon?: React.ComponentType<{ className?: string }>;
    values: Record<string, number>;
    total: number;
    series: ChartSeries[];
    muted?: boolean;
}) {
    const t = useT();
    const title = `${name}: ${series.map((s) => `${values[s.key] ?? 0} ${t(s.label_key)}`).join(', ')}`;

    return (
        <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3rem] items-end gap-3" role="img" aria-label={title} title={title}>
            <div className={cn('flex min-w-0 items-center gap-2 text-sm leading-none', muted && 'text-muted-foreground')}>
                {Icon && <Icon className="text-muted-foreground h-4 w-4 shrink-0" />}
                <span className="truncate">{name}</span>
            </div>
            <StackBar values={values} series={series} scale={total} />
            <span className="text-right font-mono text-sm leading-none font-semibold">{total.toLocaleString()}</span>
        </div>
    );
}

/** The legend for a card's heading: each part's dot and name. */
export function SplitLegend({ series }: { series: ChartSeries[] }) {
    const t = useT();

    return (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {series.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                    <i className={cn('inline-block h-2 w-2 rounded-full', FILL[s.tone])} />
                    {t(s.label_key)}
                </span>
            ))}
        </span>
    );
}

export function BucketsSection({
    chart,
    className,
    expanded,
    onToggle,
}: {
    chart: Buckets;
    className?: string;
    expanded: boolean;
    onToggle: () => void;
}) {
    const t = useT();
    const label = useChartLabel();
    const folding = fold(chart.rows, TOP_BUCKETS, expanded);
    const rest: Record<string, number> = {};
    for (const s of chart.series) rest[s.key] = folding.rest.reduce((sum, r) => sum + (r.values[s.key] ?? 0), 0);
    const restTotal = folding.rest.reduce((sum, r) => sum + r.total, 0);

    return (
        <>
            <ChartHeading
                title={t(chart.title_key)}
                className={className}
                sub={
                    // The colours, then what the number closing each line is.
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <SplitLegend series={chart.series} />
                        <span className="border-border border-l pl-3">{t('rep_k_total')}</span>
                    </span>
                }
            />
            {chart.rows.length === 0 ? (
                <div className="text-muted-foreground py-10 text-center text-sm">{t('rep_no_data')}</div>
            ) : (
                <div className="space-y-4 px-5 py-4">
                    {folding.shown.map((row, i) => (
                        <SplitLine
                            key={i}
                            name={label(row.label)}
                            icon={getLucideIcon(row.icon) ?? Box}
                            values={row.values}
                            total={row.total}
                            series={chart.series}
                        />
                    ))}
                    {folding.rest.length > 0 && (
                        <SplitLine
                            name={t('rep_chart_others').replace('{n}', String(folding.rest.length))}
                            icon={MoreHorizontal}
                            values={rest}
                            total={restTotal}
                            series={chart.series}
                            muted
                        />
                    )}
                </div>
            )}
            {folding.folds && <FoldToggle open={expanded} total={chart.rows.length} onToggle={onToggle} />}
        </>
    );
}
