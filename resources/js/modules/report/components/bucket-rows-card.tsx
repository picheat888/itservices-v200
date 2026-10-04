/**
 * The 'buckets' chart — the categories drawn as the /assets overview card "ทรัพย์สินทั้งหมดในระบบ"
 * is: each category's icon and name, its count in each group (ready / in use / written off) with
 * the group's dot, its total, then a bar on its own line split into the groups. Bars are measured
 * against the largest category, so lengths compare across rows; the legend in the heading names
 * the colours. Past `TOP_BUCKETS` the rest fold into one "อื่น ๆ (n)" row.
 * Drawn under the status donut by tabular-charts.tsx; SplitLegend is shared with places-card.tsx.
 */
import { useT } from '@/lang';
import { getLucideIcon } from '@/shared/lib/lucide-icons';
import { cn } from '@/shared/lib/utils';
import { Box, MoreHorizontal } from 'lucide-react';
import type { ChartSeries, TabularChart } from '../types';
import { ChartHeading, fold, FoldToggle, useChartLabel } from './chart-parts';
import { FILL } from './chart-tones';

type Buckets = Extract<TabularChart, { type: 'buckets' }>;

/** How many categories show before the rest fold into "อื่น ๆ". */
const TOP_BUCKETS = 5;

/**
 * One row as the /assets card draws it: an icon (optional) and the name, each part's count with
 * its dot, the total, then the split bar on its own line, measured against `max`.
 */
export function SplitLine({
    name,
    icon: Icon,
    values,
    total,
    series,
    max,
    muted,
}: {
    name: string;
    icon?: React.ComponentType<{ className?: string }>;
    values: Record<string, number>;
    total: number;
    series: ChartSeries[];
    max: number;
    muted?: boolean;
}) {
    const t = useT();
    const title = `${name}: ${series.map((s) => `${values[s.key] ?? 0} ${t(s.label_key)}`).join(', ')}`;

    return (
        <div className="space-y-1.5">
            <div className="flex items-baseline gap-3">
                <div className={cn('flex min-w-0 flex-1 items-center gap-2 text-sm', muted && 'text-muted-foreground')} title={name}>
                    {Icon && <Icon className="text-muted-foreground h-4 w-4 shrink-0" />}
                    <span className="truncate">{name}</span>
                </div>
                {/* Each count carries its part's dot; an empty part fades out. */}
                <div className="flex shrink-0 items-center gap-2.5 font-mono text-xs">
                    {series.map((s) => (
                        <span
                            key={s.key}
                            title={t(s.label_key)}
                            className={cn('flex items-center gap-1', (values[s.key] ?? 0) === 0 && 'opacity-40')}
                        >
                            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', FILL[s.tone])} />
                            {values[s.key] ?? 0}
                        </span>
                    ))}
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-sm font-semibold">{total.toLocaleString()}</span>
            </div>
            <div role="img" aria-label={title} title={title} className="bg-muted flex h-2 overflow-hidden rounded-full">
                {series.map((s) => (
                    <div key={s.key} className={FILL[s.tone]} style={{ width: `${((values[s.key] ?? 0) / max) * 100}%` }} />
                ))}
            </div>
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
    const max = Math.max(1, restTotal, ...folding.shown.map((r) => r.total));

    return (
        <>
            <ChartHeading title={t(chart.title_key)} className={className} sub={<SplitLegend series={chart.series} />} />
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
                            max={max}
                        />
                    ))}
                    {folding.rest.length > 0 && (
                        <SplitLine
                            name={t('rep_chart_others').replace('{n}', String(folding.rest.length))}
                            icon={MoreHorizontal}
                            values={rest}
                            total={restTotal}
                            series={chart.series}
                            max={max}
                            muted
                        />
                    )}
                </div>
            )}
            {folding.folds && <FoldToggle open={expanded} total={chart.rows.length} onToggle={onToggle} />}
        </>
    );
}
