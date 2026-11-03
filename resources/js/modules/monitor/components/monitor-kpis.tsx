// The five big numbers along the top of the monitor TV.
import { cn } from '@/shared/lib/utils';
import { useMonitorT } from '../hooks/use-monitor-prefs';
import { spanWords } from '../lib/monitor-time';
import type { MonitorKpis as Kpis } from '../types';

interface Tile {
    key: string;
    label: string;
    value: number;
    foot: string;
    dot: string;
    tone?: 'late' | 'near';
}

export function MonitorKpis({ kpis, now }: { kpis: Kpis; now: number }) {
    const t = useMonitorT();
    const oldest = kpis.waiting_oldest_at ? now - Date.parse(kpis.waiting_oldest_at) : null;
    const met = kpis.closed_today > 0 ? Math.round((kpis.closed_today_met / kpis.closed_today) * 100) : 100;

    const tiles: Tile[] = [
        {
            key: 'waiting',
            label: t('mon_kpi_waiting'),
            value: kpis.waiting,
            foot: oldest !== null ? t('mon_kpi_waiting_foot').replace('{t}', spanWords(oldest, t)) : t('mon_kpi_waiting_none'),
            dot: 'bg-blue-600 dark:bg-blue-400',
        },
        {
            key: 'in_progress',
            label: t('mon_kpi_in_progress'),
            value: kpis.in_progress,
            foot: t('mon_kpi_in_progress_foot').replace('{n}', String(kpis.busy_staff)),
            dot: 'bg-violet-600 dark:bg-violet-400',
        },
        {
            key: 'overdue',
            label: t('mon_kpi_overdue'),
            value: kpis.overdue,
            foot: t('mon_kpi_overdue_foot').replace('{a}', String(kpis.overdue_response)).replace('{b}', String(kpis.overdue_resolve)),
            dot: 'bg-red-600 dark:bg-red-400',
            tone: 'late',
        },
        {
            key: 'near',
            label: t('mon_kpi_near'),
            value: kpis.near_due,
            foot: t('mon_kpi_near_foot'),
            dot: 'bg-amber-600 dark:bg-amber-400',
            tone: 'near',
        },
        {
            key: 'closed',
            label: t('mon_kpi_closed'),
            value: kpis.closed_today,
            foot: t('mon_kpi_closed_foot').replace('{p}', String(met)),
            dot: 'bg-emerald-600 dark:bg-emerald-400',
        },
    ];

    return (
        <section className="grid grid-cols-5 gap-5">
            {tiles.map((tile) => (
                <div
                    key={tile.key}
                    className={cn(
                        'bg-card flex flex-col gap-1 rounded-2xl border-2 px-6 py-4',
                        tile.tone === 'late' && 'border-red-400 dark:border-red-900',
                        tile.tone === 'near' && 'border-amber-500 dark:border-amber-900',
                    )}
                >
                    <div className="text-muted-foreground flex items-center gap-2.5 text-[24px]">
                        <span className={cn('size-3.5 shrink-0 rounded-full', tile.dot)} aria-hidden />
                        {tile.label}
                    </div>
                    <div
                        className={cn(
                            'text-[80px] leading-[1.05] font-bold',
                            tile.tone === 'late' && 'text-red-700 dark:text-red-400',
                            tile.tone === 'near' && 'text-amber-800 dark:text-amber-400',
                        )}
                    >
                        {tile.value}
                    </div>
                    <div className="text-muted-foreground text-[20px]">{tile.foot}</div>
                </div>
            ))}
        </section>
    );
}
