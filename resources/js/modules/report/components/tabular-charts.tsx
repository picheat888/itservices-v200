/**
 * Charts a tabular report draws above its table (TabularRows.charts), laid out as the design's
 * asset screen: the 'stacks' chart in the wide left card — one row per department, its status
 * mix as a stacked bar against the largest row with each piece's count over it, the row total
 * after it, and a switch between the chart's views (status / source) — and, in the right card,
 * the 'donut' (shares of the whole, a headline percent in its hole, a legend with counts and
 * shares) over the 'bars'. A long list (departments past 10, categories past 8) shows its top
 * rows and folds the rest into one "อื่น ๆ (n)" row, so the bars still add up to the whole, with
 * "แสดงทั้งหมด (n)" under it to open every row in place — one switch for every list on the page,
 * so the two cards grow together. Rows marked `apart` (assets in no department) come last under
 * a dashed rule, drawn as a share of their own total so they never set the departments' scale.
 * The chosen view (สถานะ / ที่มา) lives in the URL (?view=), as the app keeps tabs.
 * Used by components/tabular-report-view.tsx; ChartsSkeleton holds the place while rows load.
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUiStore } from '@/stores/ui';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ChartLabel, ChartSeries, TabularChart } from '../types';
import { CARD_HEADING_TINT } from './card-heading';
import { FILL, STROKE, TEXT } from './chart-tones';
import { HorizontalBars } from './horizontal-bars';
import { BarRowsSkeleton, CardHeadingSkeleton } from './report-skeletons';

/** How many rows a long list shows before folding the rest into "อื่น ๆ". */
const TOP_STACKS = 10;
const TOP_BARS = 8;

/**
 * The rows a list shows: all of them, or — past `top` and while not `open` — the first `top`
 * with the rest handed back to be summed into one "อื่น ๆ" row. By default one extra row is shown
 * rather than folded, since "อื่น ๆ (1)" would only hide a name; `spare: 0` folds at exactly `top`.
 */
export function fold<T>(rows: T[], top: number, open: boolean, spare = 1) {
    const folds = rows.length > top + spare;
    const folded = folds && !open;

    return { folds, shown: folded ? rows.slice(0, top) : rows, rest: folded ? rows.slice(top) : [] };
}

/** "แสดงทั้งหมด (24)" / "ย่อ" under a folding list. */
export function FoldToggle({ open, total, onToggle }: { open: boolean; total: number; onToggle: () => void }) {
    const t = useT();
    const Icon = open ? ChevronUp : ChevronDown;

    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground mt-auto flex w-full items-center justify-center gap-1.5 border-t py-2.5 text-xs font-medium transition-colors"
        >
            <Icon className="h-3.5 w-3.5" />
            {open ? t('rep_chart_show_less') : t('rep_chart_show_all').replace('{n}', String(total))}
        </button>
    );
}

type Stacks = Extract<TabularChart, { type: 'stacks' }>;
type Donut = Extract<TabularChart, { type: 'donut' }>;
type Bars = Extract<TabularChart, { type: 'bars' }>;

function Heading({ title, sub, className }: { title: React.ReactNode; sub?: React.ReactNode; className?: string }) {
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

/** A small segmented switch between a chart's views, styled as the hub's period switch. */
function ViewSwitch({ views, active, onChange }: { views: Stacks['views']; active: string; onChange: (key: string) => void }) {
    const t = useT();

    return (
        <span role="group" className="border-border bg-card dark:bg-background inline-flex gap-0.5 rounded-md border p-0.5 font-normal">
            {views.map((view) => (
                <button
                    key={view.key}
                    type="button"
                    aria-pressed={active === view.key}
                    onClick={() => onChange(view.key)}
                    className={cn(
                        'focus-visible:ring-brand/30 h-6 rounded px-2.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none',
                        active === view.key ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                    )}
                >
                    {t(view.label_key)}
                </button>
            ))}
        </span>
    );
}

function useLabel() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (label: ChartLabel) => (lang === 'th' && label.name_th) || label.name || t('rep_no_data');
}

type StackRowData = Stacks['rows'][number] & { others?: boolean };

/**
 * A stacked bar with each piece's count printed over it, `scale` being what a full-width bar
 * stands for. Shared with the Ticket & SLA page's department card (pages/tickets-overview.tsx).
 */
export function StackBar({ values, series, scale }: { values: Record<string, number>; series: ChartSeries[]; scale: number }) {
    const t = useT();
    const width = (value: number) => `${Math.min(100, (value / Math.max(1, scale)) * 100)}%`;

    return (
        <div className="min-w-0">
            <div className="flex h-4 items-end">
                {series.map((s) => {
                    const value = values[s.key] ?? 0;
                    if (value === 0) return null;
                    return (
                        <span
                            key={s.key}
                            className={cn(
                                'flex shrink-0 justify-center overflow-visible font-mono text-xs leading-none font-semibold whitespace-nowrap',
                                TEXT[s.tone],
                            )}
                            style={{ width: width(value) }}
                        >
                            {value}
                        </span>
                    );
                })}
            </div>
            <div className="bg-muted mt-1 flex h-3 overflow-hidden rounded-full">
                {series.map((s) => {
                    const value = values[s.key] ?? 0;
                    if (value === 0) return null;
                    return (
                        <span
                            key={s.key}
                            title={`${t(s.label_key)}: ${value}`}
                            className={cn('block h-full', FILL[s.tone])}
                            style={{ width: width(value) }}
                        />
                    );
                })}
            </div>
        </div>
    );
}

/**
 * One row: name, the stacked bar with each piece's count over it, the total. `scale` is what a
 * full-width bar stands for — the largest department, or for an apart row its own total.
 */
function StackRow({
    row,
    series,
    scale,
    muted,
    note,
}: {
    row: StackRowData;
    series: Stacks['views'][number]['series'];
    scale: number;
    muted?: boolean;
    note?: string;
}) {
    const label = useLabel();

    return (
        <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3rem] items-center gap-3 px-5 py-2.5 text-sm">
            <span className="min-w-0">
                <span className={cn('block truncate', muted && 'text-muted-foreground')} title={label(row.label)}>
                    {label(row.label)}
                </span>
                {note && <span className="text-muted-foreground block truncate text-xs">{note}</span>}
            </span>
            <StackBar values={row.values} series={series} scale={scale} />
            <span className="text-right font-mono font-semibold">{row.total.toLocaleString()}</span>
        </div>
    );
}

function StacksCard({ chart, expanded, onToggle }: { chart: Stacks; expanded: boolean; onToggle: () => void }) {
    const t = useT();
    // The view is kept in the URL, like the app's tabs; an unknown value falls back to the first.
    const [params, setParams] = useSearchParams();
    const first = chart.views[0]?.key ?? '';
    const fromUrl = params.get('view');
    const viewKey = chart.views.some((v) => v.key === fromUrl) ? (fromUrl as string) : first;
    const setViewKey = (key: string) =>
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                if (key === first) next.delete('view');
                else next.set('view', key);
                return next;
            },
            { replace: true },
        );
    const series = (chart.views.find((v) => v.key === viewKey) ?? chart.views[0])?.series ?? [];
    // Only the series that appear anywhere get a legend entry.
    const legend = series.filter((s) => chart.rows.some((r) => (r.values[s.key] ?? 0) > 0));

    const departments = chart.rows.filter((r) => !r.apart);
    const apart = chart.rows.filter((r) => r.apart);
    const folding = fold(departments, TOP_STACKS, expanded);
    const rows: StackRowData[] = [...folding.shown];
    if (folding.rest.length > 0) {
        const values: Record<string, number> = {};
        for (const s of series) values[s.key] = folding.rest.reduce((sum, r) => sum + (r.values[s.key] ?? 0), 0);
        rows.push({
            label: { name: t('rep_chart_others').replace('{n}', String(folding.rest.length)), name_th: null },
            values,
            total: folding.rest.reduce((sum, r) => sum + r.total, 0),
            others: true,
        });
    }
    // Widths against the largest department on show — "อื่น ๆ" included, since it can outgrow the
    // rest; the apart rows are left out so they cannot squash every department to a sliver.
    const max = Math.max(1, ...rows.map((r) => r.total));

    return (
        <Card className="flex flex-1 flex-col overflow-hidden">
            <Heading
                title={
                    <span className="flex items-center gap-3">
                        {t(chart.title_key)}
                        {chart.views.length > 1 && <ViewSwitch views={chart.views} active={viewKey} onChange={setViewKey} />}
                    </span>
                }
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
                <>
                    <div className="divide-border/60 divide-y">
                        {rows.map((row, i) => (
                            <StackRow key={i} row={row} series={series} scale={max} muted={row.others} />
                        ))}
                    </div>
                    {apart.length > 0 && (
                        <div className="border-border divide-border/60 divide-y border-t-2 border-dashed">
                            {apart.map((row, i) => (
                                <StackRow key={i} row={row} series={series} scale={row.total} muted note={t('rep_chart_apart_note')} />
                            ))}
                        </div>
                    )}
                </>
            )}
            {folding.folds && <FoldToggle open={expanded} total={departments.length} onToggle={onToggle} />}
        </Card>
    );
}

/**
 * The figure in the middle of the donut and what it counts. A label too wide for the hole is written
 * in the lang file with a line break ("ใช้งาน\nรวมส่วนกลาง") and drawn as two smaller lines, the
 * whole block kept centred on the hole; a one-line label sits as before.
 */
function DonutCenter({ value, label }: { value: number; label: string }) {
    const lines = label.split('\n');
    const twoLines = lines.length > 1;
    return (
        <>
            <text x={85} y={twoLines ? 80 : 87} textAnchor="middle" className="fill-foreground font-mono text-[24px] font-bold">
                {`${value}%`}
            </text>
            <text
                x={85}
                y={twoLines ? 98 : 106}
                textAnchor="middle"
                className={cn('fill-muted-foreground', twoLines ? 'text-[12px]' : 'text-[13.5px]')}
            >
                {lines.map((line, i) => (
                    <tspan key={i} x={85} dy={i === 0 ? 0 : 14}>
                        {line}
                    </tspan>
                ))}
            </text>
        </>
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
                        {chart.center.value !== null && <DonutCenter value={chart.center.value} label={t(chart.center.label_key)} />}
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

/**
 * The category bars are counts, not one of the status or source colours — one soft blue for all of
 * them, the same as "Ticket ตามหมวด" on the Ticket & SLA overview.
 */
const NEUTRAL_BAR = 'bg-chart-soft-blue';

function BarsSection({ chart, className, expanded, onToggle }: { chart: Bars; className?: string; expanded: boolean; onToggle: () => void }) {
    const t = useT();
    const label = useLabel();
    const folding = fold(chart.rows, TOP_BARS, expanded);
    const bars = folding.shown.map((r, i) => ({ key: String(i), label: label(r.label), value: r.value, tone: NEUTRAL_BAR }));
    if (folding.rest.length > 0) {
        bars.push({
            key: 'others',
            label: t('rep_chart_others').replace('{n}', String(folding.rest.length)),
            value: folding.rest.reduce((sum, r) => sum + r.value, 0),
            tone: NEUTRAL_BAR,
        });
    }

    return (
        <>
            <Heading title={t(chart.title_key)} className={className} />
            <HorizontalBars bars={bars} max={Math.max(1, ...bars.map((b) => b.value))} emptyLabel={t('rep_no_data')} />
            {folding.folds && <FoldToggle open={expanded} total={chart.rows.length} onToggle={onToggle} />}
        </>
    );
}

export function TabularCharts({ charts }: { charts: TabularChart[] }) {
    const stacks = charts.filter((c): c is Stacks => c.type === 'stacks');
    const donuts = charts.filter((c): c is Donut => c.type === 'donut');
    const bars = charts.filter((c): c is Bars => c.type === 'bars');
    const side = donuts.length + bars.length > 0;
    // One "show all" for every list, so opening one card's list fills the other card's height too.
    const [expanded, setExpanded] = useState(false);
    const toggle = () => setExpanded((open) => !open);

    return (
        <div className={cn('grid gap-3', stacks.length > 0 && side && 'xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]')}>
            {stacks.length > 0 && (
                <div className="flex flex-col gap-3">
                    {stacks.map((c) => (
                        <StacksCard key={c.key} chart={c} expanded={expanded} onToggle={toggle} />
                    ))}
                </div>
            )}
            {side && (
                // One card, as the design's: the donut, then the bars under a ruled heading. Both cards
                // stretch to the row, so their bottoms line up however long either list runs.
                <Card className="flex flex-col overflow-hidden">
                    {donuts.map((c) => (
                        <DonutSection key={c.key} chart={c} />
                    ))}
                    {bars.map((c, i) => (
                        <BarsSection
                            key={c.key}
                            chart={c}
                            className={donuts.length + i > 0 ? 'border-t' : undefined}
                            expanded={expanded}
                            onToggle={toggle}
                        />
                    ))}
                </Card>
            )}
        </div>
    );
}

/** The charts' shape while rows load: the wide card of rows beside the donut-and-bars card. */
export function ChartsSkeleton() {
    return (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]" aria-hidden="true">
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
