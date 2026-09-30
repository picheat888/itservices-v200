/**
 * Number strip on top of the Report Center: one tile per snapshot figure the reader may see
 * (GET /api/reports/snapshot), each opening the report its number comes from. The period
 * (7 days / month / quarter / year) is the page's — PeriodSwitch beside the heading, held by
 * useSnapshotPeriod and remembered in localStorage (`reports.snapshot.period`).
 *
 * Only some numbers follow the period — the SLA rate and requests submitted — the rest are
 * states as of now (ReportSnapshotService). The ones that follow it say which period in
 * their own text, so switching the period shows exactly what moved.
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
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

/** Secondary line tone: things that need acting on read red/amber. */
const SECONDARY_TONE: Record<string, string> = {
    breached: 'text-red-600 dark:text-red-400',
    out: 'text-red-600 dark:text-red-400',
    overdue: 'text-amber-600 dark:text-amber-400',
};

function Delta({ value }: { value: number }) {
    const t = useT();
    const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
    const tone = value > 0 ? 'text-emerald-600 dark:text-emerald-400' : value < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground';
    return (
        <span className={cn('inline-flex items-center gap-0.5 font-medium', tone)}>
            <Icon className="h-3.5 w-3.5" />
            {t('rep_snap_delta_pt').replace('{n}', `${value > 0 ? '+' : ''}${value}`)}
        </span>
    );
}

/** Tiles whose main number is counted over the chosen period rather than as of now. */
const PERIOD_TILES = new Set(['sla_rate']);

function Tile({ tile, period }: { tile: SnapshotTile; period: SnapshotPeriod }) {
    const t = useT();
    const value = tile.value === null ? '—' : tile.unit === 'percent' ? `${tile.value}%` : tile.value.toLocaleString();
    const secondary = tile.secondary;
    const periodWords = t(`rep_period_in_${period}`);
    const label = PERIOD_TILES.has(tile.key) ? `${t(`rep_snap_${tile.key}`)} ${periodWords}` : t(`rep_snap_${tile.key}`);

    return (
        <Link to={reportRoute({ key: tile.report_key })} className="group">
            <Card className="group-hover:border-brand/40 flex h-full min-w-0 flex-col gap-1 p-4 transition-colors">
                <div className="text-muted-foreground truncate text-sm" title={label}>
                    {label}
                </div>
                <div className="font-mono text-2xl font-bold">
                    {value}
                    {tile.total !== null && <span className="text-muted-foreground ml-1 text-sm font-medium">/ {tile.total.toLocaleString()}</span>}
                </div>
                <div className="text-muted-foreground text-xs">
                    {tile.delta !== null ? (
                        <Delta value={tile.delta} />
                    ) : secondary && secondary.value !== null ? (
                        <span className={cn(secondary.value > 0 && SECONDARY_TONE[secondary.key])}>
                            {t(`rep_snap_sub_${secondary.key}`).replace('{n}', secondary.value.toLocaleString()).replace('{period}', periodWords)}
                        </span>
                    ) : tile.value === null ? (
                        // Nothing to measure yet (no case closed in the period) — say so rather than a bare dash.
                        <span>{t(`rep_snap_none_${tile.key}`)}</span>
                    ) : (
                        <span>&nbsp;</span>
                    )}
                </div>
            </Card>
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

/** Segmented period control — sits beside the Report Center heading. */
export function PeriodSwitch({ period, onChange }: { period: SnapshotPeriod; onChange: (period: SnapshotPeriod) => void }) {
    const t = useT();

    return (
        <div className="bg-muted inline-flex gap-0.5 rounded-lg p-1" role="group" aria-label={t('rep_period_label')}>
            {PERIODS.map((p) => (
                <button
                    key={p}
                    type="button"
                    aria-pressed={period === p}
                    onClick={() => onChange(p)}
                    className={cn(
                        'focus-visible:ring-brand/30 h-7 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none',
                        period === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
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

    return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {isLoading || !data
                ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)
                : data.tiles.map((tile) => <Tile key={tile.key} tile={tile} period={period} />)}
        </div>
    );
}
