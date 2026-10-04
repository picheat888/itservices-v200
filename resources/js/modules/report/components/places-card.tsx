/**
 * The 'places' chart — one card in two sections, as the status donut and the categories share one:
 * - how many sit in each place (ready stock by warehouse): a column chart, one column each in the
 *   chart's tone with its count on top and the place under the axis, measured against the fullest
 *   place, so the fullest and emptiest read at a glance. Opened past `TOP_PLACES` it turns into
 *   horizontal bars, one line per place with its name and count — fifty columns would not read;
 * - under a ruled heading, each place's share by the chart's series (bought / rented) as a small
 *   ring — the share of `center_key` (rented) written in its hole in that part's colour — with the
 *   place and each part's count under it. Opened past `TOP_PLACES` it too turns into one line per
 *   place: a bar that fills the width, split by series, its counts beside it.
 * Both sections list the same places — the first `TOP_PLACES`, then "แสดงทั้งหมด (n)" opens the
 * rest; a place not recorded comes last, faded (under a dashed rule in the opened lists). The title is
 * followed by its subtitle in a lighter weight ("ทรัพย์สินในคลัง สถานะพร้อมใช้งาน"), the count on
 * the right.
 * Drawn by tabular-charts.tsx beside the compact location card.
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import type { ChartSeries, TabularChart } from '../types';
import { SplitLegend } from './bucket-rows-card';
import { ChartHeading, fold, FoldToggle, useChartLabel } from './chart-parts';
import { FILL, STROKE, TEXT } from './chart-tones';

type Places = Extract<TabularChart, { type: 'places' }>;
type PlaceRow = Places['rows'][number];

/** How many places each section shows before "แสดงทั้งหมด". */
const TOP_PLACES = 5;

const ROW = 'grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm';

/** The tallest a column may stand, as a share of the plot — room is left for its count on top. */
const COLUMN_MAX = 85;

/**
 * How many sit in each place, as columns against the fullest place: the count over each column, the
 * place's name under the axis. A place not recorded is the last column, faded.
 */
function CountColumns({ rows, tone, max }: { rows: PlaceRow[]; tone: string; max: number }) {
    const label = useChartLabel();

    return (
        <div className="px-5 pt-4 pb-3">
            <div className="border-border flex h-40 items-end gap-3 border-b">
                {rows.map((row, i) => (
                    <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                        <span className={cn('font-mono text-xs font-semibold', row.apart && 'text-muted-foreground')}>
                            {row.total.toLocaleString()}
                        </span>
                        <span
                            role="img"
                            aria-label={`${label(row.label)}: ${row.total}`}
                            title={`${label(row.label)}: ${row.total}`}
                            className={cn('block w-full max-w-14 rounded-t-md', tone, row.apart && 'opacity-50')}
                            style={{ height: `${(row.total / max) * COLUMN_MAX}%` }}
                        />
                    </div>
                ))}
            </div>
            <div className="mt-2 flex gap-3">
                {rows.map((row, i) => (
                    <span
                        key={i}
                        className={cn('min-w-0 flex-1 truncate text-center text-xs', row.apart ? 'text-muted-foreground' : 'text-foreground')}
                        title={label(row.label)}
                    >
                        {label(row.label)}
                    </span>
                ))}
            </div>
        </div>
    );
}

/** One place's count as a horizontal bar against the fullest place — the opened list's line. */
function CountLine({ row, tone, max }: { row: PlaceRow; tone: string; max: number }) {
    const label = useChartLabel();

    return (
        <div className={ROW}>
            <span className={cn('truncate', row.apart && 'text-muted-foreground')} title={label(row.label)}>
                {label(row.label)}
            </span>
            <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                <span className={cn('block h-full rounded-full', tone, row.apart && 'opacity-50')} style={{ width: `${(row.total / max) * 100}%` }} />
            </div>
            <span className="w-8 text-right font-mono font-semibold">{row.total.toLocaleString()}</span>
        </div>
    );
}

/** Every place's count as horizontal bars, a place not recorded last under a dashed rule. */
function CountList({ rows, apart, tone, max }: { rows: PlaceRow[]; apart: PlaceRow[]; tone: string; max: number }) {
    return (
        <>
            <div className="space-y-3 px-5 py-4">
                {rows.map((row, i) => (
                    <CountLine key={i} row={row} tone={tone} max={max} />
                ))}
            </div>
            {apart.length > 0 && (
                <div className="border-border space-y-3 border-t-2 border-dashed px-5 py-4">
                    {apart.map((row, i) => (
                        <CountLine key={i} row={row} tone={tone} max={max} />
                    ))}
                </div>
            )}
        </>
    );
}

/** One place's share by series, as a bar that fills the width, with each part's count and dot — the opened list's line. */
function ShareLine({ row, series }: { row: PlaceRow; series: ChartSeries[] }) {
    const t = useT();
    const label = useChartLabel();
    const title = `${label(row.label)}: ${series.map((s) => `${row.values[s.key] ?? 0} ${t(s.label_key)}`).join(', ')}`;

    return (
        <div className={ROW}>
            <span className={cn('truncate', row.apart && 'text-muted-foreground')} title={label(row.label)}>
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

/** Every place's share as bars, a place not recorded last under a dashed rule. */
function ShareList({ rows, apart, series }: { rows: PlaceRow[]; apart: PlaceRow[]; series: ChartSeries[] }) {
    return (
        <>
            <div className="space-y-3 px-5 py-4">
                {rows.map((row, i) => (
                    <ShareLine key={i} row={row} series={series} />
                ))}
            </div>
            {apart.length > 0 && (
                <div className="border-border space-y-3 border-t-2 border-dashed px-5 py-4">
                    {apart.map((row, i) => (
                        <ShareLine key={i} row={row} series={series} />
                    ))}
                </div>
            )}
        </>
    );
}

const RING_R = 24;
const RING_WIDTH = 8;
const RING_C = 2 * Math.PI * RING_R;

/**
 * One place's share by series as a small ring, the share of `centerKey` in its hole (in that part's
 * colour), then the place and each part's count with its dot.
 */
function ShareRing({ row, series, centerKey }: { row: PlaceRow; series: ChartSeries[]; centerKey: string }) {
    const t = useT();
    const label = useChartLabel();
    const parts = series.filter((s) => (row.values[s.key] ?? 0) > 0);
    const center = series.find((s) => s.key === centerKey);
    const share = row.total > 0 ? Math.round(((row.values[centerKey] ?? 0) / row.total) * 100) : null;
    const title = `${label(row.label)}: ${series.map((s) => `${row.values[s.key] ?? 0} ${t(s.label_key)}`).join(', ')}`;
    let offset = 0;

    return (
        <div className={cn('flex min-w-0 flex-col items-center gap-1 text-center', row.apart && 'opacity-60')}>
            <svg viewBox="0 0 60 60" className="h-16 w-16" role="img" aria-label={title}>
                <title>{title}</title>
                <circle cx={30} cy={30} r={RING_R} fill="none" strokeWidth={RING_WIDTH} className="stroke-muted" />
                {parts.map((s) => {
                    // A small gap between the parts, so two of them still read apart.
                    const length = ((row.values[s.key] ?? 0) / row.total) * RING_C;
                    const drawn = Math.max(length - (parts.length > 1 ? 1.5 : 0), 0.5);
                    const arc = (
                        <circle
                            key={s.key}
                            cx={30}
                            cy={30}
                            r={RING_R}
                            fill="none"
                            strokeWidth={RING_WIDTH}
                            strokeDasharray={`${drawn} ${RING_C - drawn}`}
                            strokeDashoffset={-offset}
                            transform="rotate(-90 30 30)"
                            className={STROKE[s.tone]}
                        />
                    );
                    offset += length;
                    return arc;
                })}
                <text
                    x={30}
                    y={34.5}
                    textAnchor="middle"
                    className={cn('font-mono text-[12px] font-bold', center ? cn('fill-current', TEXT[center.tone]) : 'fill-foreground')}
                >
                    {share === null ? '—' : `${share}%`}
                </text>
            </svg>
            <span className="w-full truncate text-xs" title={label(row.label)}>
                {label(row.label)}
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px]">
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
    const centerSeries = chart.series.find((s) => s.key === chart.center_key);
    // Opened past TOP_PLACES: both sections turn into one line per place.
    const opened = folding.folds && expanded;

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
                    {/* Columns while a handful show; opened past TOP_PLACES, one line per place. */}
                    {opened ? (
                        <CountList rows={folding.shown} apart={apart} tone={FILL[chart.tone]} max={max} />
                    ) : (
                        <CountColumns rows={[...folding.shown, ...apart]} tone={FILL[chart.tone]} max={max} />
                    )}
                    <ChartHeading
                        title={t(chart.split_title_key)}
                        sub={
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <SplitLegend series={chart.series} />
                                {centerSeries && !opened && <span>{t('rep_chart_ring_center').replace('{name}', t(centerSeries.label_key))}</span>}
                            </span>
                        }
                        className="border-t"
                    />
                    {/* Rings while a handful show; opened, one bar per place reads easier down a long list. */}
                    {opened ? (
                        <ShareList rows={folding.shown} apart={apart} series={chart.series} />
                    ) : (
                        <div className="grid grid-cols-3 gap-x-3 gap-y-4 px-5 py-4 sm:grid-cols-5">
                            {[...folding.shown, ...apart].map((row, i) => (
                                <ShareRing key={i} row={row} series={chart.series} centerKey={chart.center_key} />
                            ))}
                        </div>
                    )}
                </>
            )}
            {folding.folds && <FoldToggle open={expanded} total={places.length} onToggle={onToggle} />}
        </Card>
    );
}
