/**
 * Number strip on top of the Report Center, laid out as the design's single card split into
 * cells: one per snapshot figure the reader may see (GET /api/reports/snapshot), each opening
 * the report its number comes from. A cell reads label / number / footer, the footer carrying
 * the change over the period with a small trend line where the history exists (open tickets,
 * SLA rate), or the figure's call to act (renew, reorder). The period (7 days / month /
 * quarter / year) is the page's — PeriodSwitch beside the heading, held by useSnapshotPeriod
 * and remembered in localStorage (`reports.snapshot.period`).
 *
 * Only some numbers follow the period — the SLA rate and requests submitted — the rest are
 * states as of now (ReportSnapshotService). The ones that follow it say which period in
 * their own text, so switching the period shows exactly what moved.
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReportSnapshot } from '../hooks/use-reports';
import type { SnapshotPeriod, SnapshotTile } from '../types';
import { reportRoute } from './report-catalogue';

const PERIODS: SnapshotPeriod[] = ['7d', 'month', 'quarter', 'year'];
const STORAGE_KEY = 'reports.snapshot.period';

const isPeriod = (value: unknown): value is SnapshotPeriod => typeof value === 'string' && (PERIODS as string[]).includes(value);

function loadPeriod(): SnapshotPeriod {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return isPeriod(stored) ? stored : 'month';
    } catch {
        return 'month';
    }
}

/** Tiles whose main number is counted over the chosen period rather than as of now. */
const PERIOD_TILES = new Set(['sla_rate']);

/** Which way is good: more open tickets is worse, a higher SLA rate is better. */
const UP_IS_GOOD: Record<string, boolean> = { tickets_open: false, sla_rate: true };

/** Trend line colour per tile — the chart palette's red for the backlog, green for SLA. */
const TREND_TONE: Record<string, string> = { tickets_open: 'text-red-500', sla_rate: 'text-emerald-500' };

const GOOD = 'text-emerald-600 dark:text-emerald-400';
const BAD = 'text-red-600 dark:text-red-400';

/** "▲ 6" / "▼ 1.8 pt" — coloured by whether the move is good for this figure. */
function Delta({ tile }: { tile: SnapshotTile }) {
    const t = useT();
    const value = tile.delta ?? 0;
    if (value === 0) return <span className="text-muted-foreground font-semibold">{t('rep_snap_same')}</span>;
    const good = value > 0 === (UP_IS_GOOD[tile.key] ?? true);
    const size = tile.unit === 'percent' ? t('rep_snap_delta_pt').replace('{n}', String(Math.abs(value))) : String(Math.abs(value));

    return (
        <span className={cn('font-semibold', good ? GOOD : BAD)}>
            {value > 0 ? '▲' : '▼'} {size}
        </span>
    );
}

/** A 70×20 line of the tile's value across the period; empty points are skipped. */
function Sparkline({ values, className }: { values: (number | null)[]; className: string }) {
    const known = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
    if (known.length < 2) return null;
    const W = 70;
    const H = 20;
    const lo = Math.min(...known.map((p) => p[1]));
    const hi = Math.max(...known.map((p) => p[1]));
    const x = (i: number) => 2 + (i * (W - 4)) / (values.length - 1);
    const y = (v: number) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 6);
    const line = known.map(([i, v], n) => `${n ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const [lastI, lastV] = known[known.length - 1];

    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={cn('shrink-0', className)} aria-hidden="true">
            <path d={`${line} L${x(lastI).toFixed(1)} ${H} L${x(known[0][0]).toFixed(1)} ${H} Z`} fill="currentColor" fillOpacity={0.12} />
            <path d={line} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
            <circle cx={x(lastI)} cy={y(lastV)} r={2.4} fill="currentColor" />
        </svg>
    );
}

function Pill({ tone, children }: { tone: 'amber' | 'red'; children: React.ReactNode }) {
    return (
        <span
            className={cn(
                'inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap',
                tone === 'amber' ? 'bg-amber-500/12 text-amber-700 dark:text-amber-400' : 'bg-red-500/12 text-red-700 dark:text-red-400',
            )}
        >
            <i className="h-1.5 w-1.5 rounded-full bg-current" />
            {children}
        </span>
    );
}

function Footer({ tile, periodWords }: { tile: SnapshotTile; periodWords: string }) {
    const t = useT();
    const sub = tile.secondary;
    const subText =
        sub && sub.value !== null ? t(`rep_snap_sub_${sub.key}`).replace('{n}', sub.value.toLocaleString()).replace('{period}', periodWords) : null;

    switch (tile.key) {
        case 'tickets_open':
        case 'sla_rate':
            if (tile.value === null) return <span className="text-muted-foreground">{t(`rep_snap_none_${tile.key}`)}</span>;
            return (
                <>
                    {tile.delta !== null ? <Delta tile={tile} /> : <span />}
                    {tile.trend && <Sparkline values={tile.trend} className={TREND_TONE[tile.key]} />}
                </>
            );
        case 'contracts_expiring':
            // Something to renew: the ones already past their end first, as in the design's pill.
            if (!tile.value) return <span className="text-muted-foreground">&nbsp;</span>;
            return <Pill tone="amber">{sub && sub.value ? subText : t('rep_snap_pill_renew')}</Pill>;
        case 'stock_below_min':
            if (!tile.value) return <span className="text-muted-foreground">&nbsp;</span>;
            return <Pill tone="red">{sub && sub.value ? subText : t('rep_snap_pill_reorder')}</Pill>;
        default:
            return <span className="text-muted-foreground truncate">{subText ?? ' '}</span>;
    }
}

function Tile({ tile, period }: { tile: SnapshotTile; period: SnapshotPeriod }) {
    const t = useT();
    const value = tile.value === null ? '—' : tile.unit === 'percent' ? tile.value.toLocaleString() : tile.value.toLocaleString();
    const periodWords = t(`rep_period_in_${period}`);
    const label = PERIOD_TILES.has(tile.key) ? `${t(`rep_snap_${tile.key}`)} ${periodWords}` : t(`rep_snap_${tile.key}`);
    // The open-ticket cell's footer is its trend, so its "past SLA" count sits beside the number.
    const beside =
        tile.key === 'tickets_open' && tile.secondary?.value
            ? t(`rep_snap_sub_${tile.secondary.key}`).replace('{n}', tile.secondary.value.toLocaleString())
            : null;

    return (
        <Link
            to={reportRoute({ key: tile.report_key })}
            className="bg-card hover:bg-accent focus-visible:ring-brand/30 flex min-w-0 flex-col gap-1 px-4 py-3.5 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        >
            <span className="text-muted-foreground truncate text-xs" title={label}>
                {label}
            </span>
            <span className="flex items-baseline gap-1.5 font-mono text-[22px] leading-tight font-bold">
                {value}
                {tile.unit === 'percent' && tile.value !== null && <small className="text-muted-foreground text-xs font-medium">%</small>}
                {tile.total !== null && <small className="text-muted-foreground text-xs font-medium">/ {tile.total.toLocaleString()}</small>}
                {beside && <small className={cn('truncate font-sans text-xs font-semibold', BAD)}>{beside}</small>}
            </span>
            <span className="flex min-h-5 items-center justify-between gap-1.5 text-[11.5px]">
                <Footer tile={tile} periodWords={periodWords} />
            </span>
        </Link>
    );
}

/** The chosen period, remembered in localStorage like a list filter. */
export function useSnapshotPeriod(): [SnapshotPeriod, (period: SnapshotPeriod) => void] {
    const [period, setPeriod] = useState<SnapshotPeriod>(loadPeriod);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, period);
        } catch {
            // Storage blocked — the period still holds for this visit.
        }
    }, [period]);

    return [period, setPeriod];
}

/**
 * Segmented period control beside the Reports heading. On the light page ground a muted track
 * vanished, so in light it is a bordered card with the chosen period in brand (as the Ticket
 * page's range switch); dark keeps its muted track, which already reads.
 */
export function PeriodSwitch({ period, onChange }: { period: SnapshotPeriod; onChange: (period: SnapshotPeriod) => void }) {
    const t = useT();

    return (
        <div
            className="border-border bg-card dark:bg-muted inline-flex gap-0.5 rounded-lg border p-0.5 shadow-xs dark:border-transparent dark:shadow-none"
            role="group"
            aria-label={t('rep_period_label')}
        >
            {PERIODS.map((p) => (
                <button
                    key={p}
                    type="button"
                    aria-pressed={period === p}
                    onClick={() => onChange(p)}
                    className={cn(
                        'focus-visible:ring-brand/30 h-7 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none',
                        period === p
                            ? 'bg-brand text-brand-foreground dark:bg-background dark:text-foreground dark:shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent dark:hover:bg-transparent',
                    )}
                >
                    {t(`rep_period_${p}`)}
                </button>
            ))}
        </div>
    );
}

export function SnapshotStrip({ period }: { period: SnapshotPeriod }) {
    const { data, isLoading } = useReportSnapshot(period);

    if (!isLoading && (data?.tiles.length ?? 0) === 0) return null;

    // One card; the 1px gaps over the border colour draw the dividers between cells, and keep
    // drawing them when the cells wrap onto a second row on narrower screens.
    return (
        <Card className="bg-border grid grid-cols-2 gap-px overflow-hidden md:grid-cols-3 xl:grid-cols-6">
            {isLoading || !data
                ? Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className="bg-card space-y-2 px-4 py-3.5">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-6 w-14" />
                          <Skeleton className="h-3 w-20" />
                      </div>
                  ))
                : data.tiles.map((tile) => <Tile key={tile.key} tile={tile} period={period} />)}
        </Card>
    );
}
