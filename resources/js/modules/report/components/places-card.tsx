/**
 * The 'places' chart — one card in two sections, as the status donut and the categories share one:
 * - how many sit in each place (ready stock by warehouse): one bar each in the chart's tone,
 *   measured against the fullest place, so the fullest and emptiest read at a glance;
 * - under a ruled heading, each place's share by the chart's series (bought / rented) as a bar
 *   that always fills the width, its counts beside it.
 * Both sections list the same places — the first `TOP_PLACES`, then "แสดงทั้งหมด (n)" opens the
 * rest; a row with no place recorded comes last under a dashed rule. The title is followed by its
 * subtitle in a lighter weight ("ทรัพย์สินในคลัง สถานะพร้อมใช้งาน"), the count on the right.
 * Drawn by tabular-charts.tsx beside the compact location card.
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import type { ChartSeries, TabularChart } from '../types';
import { SplitLegend } from './bucket-rows-card';
import { ChartHeading, fold, FoldToggle, useChartLabel } from './chart-parts';
import { FILL } from './chart-tones';

type Places = Extract<TabularChart, { type: 'places' }>;
type PlaceRow = Places['rows'][number];

/** How many places each section shows before "แสดงทั้งหมด". */
const TOP_PLACES = 5;

const ROW = 'grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm';

/** One place's count as a bar against the fullest place. */
function CountLine({ row, tone, max, muted }: { row: PlaceRow; tone: string; max: number; muted?: boolean }) {
    const label = useChartLabel();

    return (
        <div className={ROW}>
            <span className={cn('truncate', muted && 'text-muted-foreground')} title={label(row.label)}>
                {label(row.label)}
            </span>
            <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                <span className={cn('block h-full rounded-full', tone)} style={{ width: `${(row.total / max) * 100}%` }} />
            </div>
            <span className="w-8 text-right font-mono font-semibold">{row.total.toLocaleString()}</span>
        </div>
    );
}

/** One place's share by series, as a bar that fills the width, with each part's count and dot. */
function ShareLine({ row, series, muted }: { row: PlaceRow; series: ChartSeries[]; muted?: boolean }) {
    const t = useT();
    const label = useChartLabel();
    const title = `${label(row.label)}: ${series.map((s) => `${row.values[s.key] ?? 0} ${t(s.label_key)}`).join(', ')}`;

    return (
        <div className={ROW}>
            <span className={cn('truncate', muted && 'text-muted-foreground')} title={label(row.label)}>
                {label(row.label)}
            </span>
            <div role="img" aria-label={title} title={title} className="bg-muted flex h-2.5 overflow-hidden rounded-full">
                {series.map((s) => (
                    <span key={s.key} className={FILL[s.tone]} style={{ width: `${((row.values[s.key] ?? 0) / Math.max(1, row.total)) * 100}%` }} />
                ))}
            </div>
            <span className="flex items-center gap-2.5 font-mono text-xs">
                {series.map((s) => (
                    <span
                        key={s.key}
                        title={t(s.label_key)}
                        className={cn('flex items-center gap-1', (row.values[s.key] ?? 0) === 0 && 'opacity-40')}
                    >
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', FILL[s.tone])} />
                        {row.values[s.key] ?? 0}
                    </span>
                ))}
            </span>
        </div>
    );
}

export function PlacesCard({ chart, expanded, onToggle }: { chart: Places; expanded: boolean; onToggle: () => void }) {
    const t = useT();
    const places = chart.rows.filter((r) => !r.apart);
    const apart = chart.rows.filter((r) => r.apart);
    // No "อื่น ๆ" row: the count in the heading already says how many there are in all.
    const folding = fold(places, TOP_PLACES, expanded, 0);
    const max = Math.max(1, ...chart.rows.map((r) => r.total));

    return (
        <Card className="flex flex-col overflow-hidden">
            <ChartHeading
                title={
                    <span className="flex flex-wrap items-baseline gap-x-2">
                        {t(chart.title_key)}
                        <span className="text-muted-foreground font-normal">{t(chart.subtitle_key)}</span>
                    </span>
                }
                sub={t('rep_chart_items').replace('{n}', chart.total.toLocaleString())}
            />
            {chart.rows.length === 0 ? (
                <div className="text-muted-foreground py-10 text-center text-sm">{t('rep_no_data')}</div>
            ) : (
                <>
                    <div className="space-y-3 px-5 py-4">
                        {folding.shown.map((row, i) => (
                            <CountLine key={i} row={row} tone={FILL[chart.tone]} max={max} />
                        ))}
                    </div>
                    {apart.length > 0 && (
                        <div className="border-border space-y-3 border-t-2 border-dashed px-5 py-4">
                            {apart.map((row, i) => (
                                <CountLine key={i} row={row} tone={FILL[chart.tone]} max={max} muted />
                            ))}
                        </div>
                    )}
                    <ChartHeading title={t(chart.split_title_key)} sub={<SplitLegend series={chart.series} />} className="border-t" />
                    <div className="space-y-3 px-5 py-4">
                        {folding.shown.map((row, i) => (
                            <ShareLine key={i} row={row} series={chart.series} />
                        ))}
                        {apart.map((row, i) => (
                            <ShareLine key={`apart-${i}`} row={row} series={chart.series} muted />
                        ))}
                    </div>
                </>
            )}
            {folding.folds && <FoldToggle open={expanded} total={places.length} onToggle={onToggle} />}
        </Card>
    );
}
