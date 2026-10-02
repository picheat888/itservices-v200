/**
 * Charts a tabular report draws above its table (TabularRows.charts), laid out as the design's
 * asset screen: the 'stacks' chart in the wide left card — one row per department, its status
 * mix as a stacked bar against the largest row, the count after it — and, in the right card,
 * the 'donut' (shares of the whole, a headline percent in its hole, a legend with counts and
 * shares) over the 'bars'. Used by pages/tabular-report.tsx; ChartsSkeleton holds the place
 * while rows load.
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUiStore } from '@/stores/ui';
import type { ChartLabel, ChartTone, TabularChart } from '../types';
import { CARD_HEADING_TINT } from './card-heading';
import { HorizontalBars } from './horizontal-bars';
import { BarRowsSkeleton, CardHeadingSkeleton } from './report-skeletons';

/** Each tone as a fill (bars, swatches) and as a stroke (donut arcs). */
const FILL: Record<ChartTone, string> = {
    green: 'bg-emerald-500',
    blue: 'bg-blue-500',
    violet: 'bg-violet-500',
    orange: 'bg-orange-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    gray: 'bg-slate-400 dark:bg-slate-500',
};
const STROKE: Record<ChartTone, string> = {
    green: 'stroke-emerald-500',
    blue: 'stroke-blue-500',
    violet: 'stroke-violet-500',
    orange: 'stroke-orange-500',
    amber: 'stroke-amber-500',
    red: 'stroke-red-500',
    gray: 'stroke-slate-400 dark:stroke-slate-500',
};

type Stacks = Extract<TabularChart, { type: 'stacks' }>;
type Donut = Extract<TabularChart, { type: 'donut' }>;
type Bars = Extract<TabularChart, { type: 'bars' }>;

function Heading({ title, sub, className }: { title: string; sub?: React.ReactNode; className?: string }) {
    return (
        <div
            className={cn(
                CARD_HEADING_TINT,
                'border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3',
                className,
            )}
        >
            <span className="text-sm font-semibold">{title}</span>
            {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
        </div>
    );
}

function useLabel() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (label: ChartLabel) => (lang === 'th' && label.name_th) || label.name || t('rep_no_data');
}

function StacksCard({ chart }: { chart: Stacks }) {
    const t = useT();
    const label = useLabel();
    const max = Math.max(1, ...chart.rows.map((r) => r.total));
    // Only the series that appear anywhere get a legend entry.
    const legend = chart.legend.filter((s) => chart.rows.some((r) => (r.values[s.key] ?? 0) > 0));

    return (
        <Card className="overflow-hidden">
            <Heading
                title={t(chart.title_key)}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {legend.map((s) => (
                            <span key={s.key} className="inline-flex items-center gap-1.5">
                                <i className={cn('inline-block h-2.5 w-2.5 rounded-sm', FILL[s.tone])} />
                                {t(s.label_key)}
                            </span>
                        ))}
                    </span>
                }
            />
            {chart.rows.length === 0 ? (
                <div className="text-muted-foreground py-10 text-center text-sm">{t('rep_no_data')}</div>
            ) : (
                <div className="divide-border/60 divide-y">
                    {chart.rows.map((row, i) => (
                        <div key={i} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3rem] items-center gap-3 px-5 py-2.5 text-sm">
                            <span className="truncate" title={label(row.label)}>
                                {label(row.label)}
                            </span>
                            {/* Width against the largest row, so rows compare by size as well as mix. */}
                            <div className="bg-muted flex h-3 overflow-hidden rounded-full">
                                {chart.legend.map((s) => {
                                    const value = row.values[s.key] ?? 0;
                                    if (value === 0) return null;
                                    return (
                                        <span
                                            key={s.key}
                                            title={`${t(s.label_key)}: ${value}`}
                                            className={cn('block h-full', FILL[s.tone])}
                                            style={{ width: `${(value / max) * 100}%` }}
                                        />
                                    );
                                })}
                            </div>
                            <span className="text-right font-mono font-semibold">{row.total.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

const R = 62;
const STROKE_WIDTH = 20;
const C = 2 * Math.PI * R;

function DonutSection({ chart }: { chart: Donut }) {
    const t = useT();
    const segments = chart.segments.filter((s) => s.value > 0);
    let offset = 0;

    return (
        <>
            <Heading title={t(chart.title_key)} sub={t('rep_chart_items').replace('{n}', chart.total.toLocaleString())} />
            {chart.total === 0 ? (
                <div className="text-muted-foreground py-10 text-center text-sm">{t('rep_no_data')}</div>
            ) : (
                <div className="grid items-center gap-5 px-5 py-4 sm:grid-cols-[150px_minmax(0,1fr)]">
                    <svg viewBox="0 0 170 170" className="mx-auto h-[150px] w-[150px]" role="img" aria-label={t(chart.title_key)}>
                        <circle cx={85} cy={85} r={R} fill="none" strokeWidth={STROKE_WIDTH} className="stroke-muted" />
                        {segments.map((s) => {
                            // A 2px gap between arcs, so neighbours of one colour still read apart.
                            const length = (s.value / chart.total) * C;
                            const drawn = Math.max(length - (segments.length > 1 ? 2 : 0), 0.5);
                            const arc = (
                                <circle
                                    key={s.key}
                                    cx={85}
                                    cy={85}
                                    r={R}
                                    fill="none"
                                    strokeWidth={STROKE_WIDTH}
                                    strokeDasharray={`${drawn} ${C - drawn}`}
                                    strokeDashoffset={-offset}
                                    transform="rotate(-90 85 85)"
                                    className={STROKE[s.tone]}
                                >
                                    <title>{`${t(s.label_key)}: ${s.value}`}</title>
                                </circle>
                            );
                            offset += length;
                            return arc;
                        })}
                        {chart.center.value !== null && (
                            <>
                                <text x={85} y={87} textAnchor="middle" className="fill-foreground font-mono text-[24px] font-bold">
                                    {`${chart.center.value}%`}
                                </text>
                                <text x={85} y={106} textAnchor="middle" className="fill-muted-foreground text-[11.5px]">
                                    {t(chart.center.label_key)}
                                </text>
                            </>
                        )}
                    </svg>
                    <div className="space-y-2 text-sm">
                        {chart.segments.map((s) => (
                            <div key={s.key} className="grid grid-cols-[12px_minmax(0,1fr)_auto_3rem] items-center gap-2">
                                <i className={cn('h-2.5 w-2.5 rounded-sm', FILL[s.tone])} />
                                <span className="truncate">{t(s.label_key)}</span>
                                <b className="font-mono">{s.value.toLocaleString()}</b>
                                <span className="text-muted-foreground text-right font-mono text-xs">
                                    {`${((s.value / chart.total) * 100).toFixed(1)}%`}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}

function BarsSection({ chart, className }: { chart: Bars; className?: string }) {
    const t = useT();
    const label = useLabel();

    return (
        <>
            <Heading title={t(chart.title_key)} className={className} />
            <HorizontalBars
                bars={chart.rows.map((r, i) => ({ key: String(i), label: label(r.label), value: r.value }))}
                max={Math.max(1, ...chart.rows.map((r) => r.value))}
                emptyLabel={t('rep_no_data')}
            />
        </>
    );
}

export function TabularCharts({ charts }: { charts: TabularChart[] }) {
    const stacks = charts.filter((c): c is Stacks => c.type === 'stacks');
    const donuts = charts.filter((c): c is Donut => c.type === 'donut');
    const bars = charts.filter((c): c is Bars => c.type === 'bars');
    const side = donuts.length + bars.length > 0;

    return (
        <div className={cn('grid items-start gap-3', stacks.length > 0 && side && 'xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]')}>
            {stacks.length > 0 && (
                <div className="space-y-3">
                    {stacks.map((c) => (
                        <StacksCard key={c.key} chart={c} />
                    ))}
                </div>
            )}
            {side && (
                // One card, as the design's: the donut, then the bars under a ruled heading.
                <Card className="overflow-hidden">
                    {donuts.map((c) => (
                        <DonutSection key={c.key} chart={c} />
                    ))}
                    {bars.map((c, i) => (
                        <BarsSection key={c.key} chart={c} className={donuts.length + i > 0 ? 'border-t' : undefined} />
                    ))}
                </Card>
            )}
        </div>
    );
}

/** The charts' shape while rows load: the wide card of rows beside the donut-and-bars card. */
export function ChartsSkeleton() {
    return (
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]" aria-hidden="true">
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <BarRowsSkeleton rows={6} />
            </Card>
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <div className="flex items-center gap-5 px-5 py-4">
                    <Skeleton className="h-[150px] w-[150px] shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2.5">
                        {Array.from({ length: 5 }, (_, i) => (
                            <Skeleton key={i} className="h-3.5 w-full" />
                        ))}
                    </div>
                </div>
            </Card>
        </div>
    );
}
