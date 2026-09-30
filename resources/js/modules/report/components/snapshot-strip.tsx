/**
 * Number strip on top of the Report Center: period chips (7 days / month / quarter / year)
 * and one tile per snapshot figure the reader may see (GET /api/reports/snapshot). Each tile
 * opens the report its number comes from. Chosen period is remembered in localStorage
 * (`reports.snapshot.period`), like a list filter.
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

function Tile({ tile }: { tile: SnapshotTile }) {
    const t = useT();
    const value = tile.value === null ? '—' : tile.unit === 'percent' ? `${tile.value}%` : tile.value.toLocaleString();
    const secondary = tile.secondary;

    return (
        <Link to={reportRoute({ key: tile.report_key })} className="group">
            <Card className="group-hover:border-brand/40 flex h-full min-w-0 flex-col gap-1 p-4 transition-colors">
                <div className="text-muted-foreground truncate text-sm">{t(`rep_snap_${tile.key}`)}</div>
                <div className="font-mono text-2xl font-bold">
                    {value}
                    {tile.total !== null && <span className="text-muted-foreground ml-1 text-sm font-medium">/ {tile.total.toLocaleString()}</span>}
                </div>
                <div className="text-muted-foreground text-xs">
                    {tile.delta !== null ? (
                        <Delta value={tile.delta} />
                    ) : secondary && secondary.value !== null ? (
                        <span className={cn(secondary.value > 0 && SECONDARY_TONE[secondary.key])}>
                            {t(`rep_snap_sub_${secondary.key}`).replace('{n}', secondary.value.toLocaleString())}
                        </span>
                    ) : (
                        <span>&nbsp;</span>
                    )}
                </div>
            </Card>
        </Link>
    );
}

export function SnapshotStrip() {
    const t = useT();
    const [period, setPeriod] = useState<SnapshotPeriod>(loadPeriod);
    const { data, isLoading } = useReportSnapshot(period);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, period);
        } catch {
            // Storage blocked — the period still holds for this visit.
        }
    }, [period]);

    if (!isLoading && (data?.tiles.length ?? 0) === 0) return null;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
                {PERIODS.map((p) => (
                    <button
                        key={p}
                        type="button"
                        onClick={() => setPeriod(p)}
                        className={cn(
                            'h-8 rounded-full border px-3 text-xs font-semibold',
                            period === p ? 'bg-brand border-brand text-brand-foreground' : 'border-border text-muted-foreground bg-background',
                        )}
                    >
                        {t(`rep_period_${p}`)}
                    </button>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {isLoading || !data
                    ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)
                    : data.tiles.map((tile) => <Tile key={tile.key} tile={tile} />)}
            </div>
        </div>
    );
}
