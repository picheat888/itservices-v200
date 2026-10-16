// Dashboard "งาน IT": the live queue, two weeks of flow and the overview report's SLA figures, then the volume and workload cards.
import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { useFoldRow } from '@/modules/report';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { CircleCheck, CirclePlus, Layers, Target, Timer, Wrench } from 'lucide-react';
import type { DashboardIt } from '../api/dashboardApi';
import { dashLinks } from '../lib/links';
import { DashTile, Delta, PAIR_GRID, SectionHeading, SparkFooter, TILE_GRID } from './dash-parts';
import { OpenedPerDayCard } from './opened-per-day-card';
import { WorkloadCard } from './workload-card';

const FOLDS = ['workload'] as const;

export function ItSection({ it }: { it: DashboardIt }) {
    const t = useT();
    const { can } = useAuth();
    const links = dashLinks(can);
    const row = useFoldRow(FOLDS);
    const backlog = it.backlog.open + it.backlog.in_progress;
    const peak = (n: number) => t('dash_peak_cases').replace('{n}', String(n));
    const { rate, goal } = it.sla;
    const belowGoal = rate !== null && rate < goal;

    return (
        <section aria-labelledby="dash-it" className="space-y-3">
            <SectionHeading
                id="dash-it"
                icon={Wrench}
                title={t('dash_sec_it')}
                link={links.ticketsHome ? { to: links.ticketsHome, label: t('dash_go_tickets') } : null}
            />
            <div className={TILE_GRID}>
                <DashTile
                    to={links.ticketsAll}
                    icon={Layers}
                    label={t('rep_kpi_backlog')}
                    value={backlog}
                    unit={t('dash_unit_cases')}
                    badge={
                        it.backlog.over_sla > 0 ? (
                            <StatusBadge tone="red">{t('dash_over_sla_n').replace('{n}', String(it.backlog.over_sla))}</StatusBadge>
                        ) : undefined
                    }
                    footer={
                        <SparkFooter
                            text={<Delta value={it.backlog.delta_14d} upIsBad label={t('dash_vs_14d')} />}
                            values={it.backlog.series}
                            className={it.backlog.delta_14d > 0 ? 'text-red-500' : 'text-blue-500'}
                        />
                    }
                />
                <DashTile
                    to={links.ticketsAll}
                    icon={CirclePlus}
                    label={t('dash_opened_14d')}
                    value={it.opened.total}
                    unit={t('dash_unit_cases')}
                    footer={<SparkFooter text={peak(it.opened.peak)} values={it.opened.series} className="text-blue-500" />}
                />
                <DashTile
                    to={links.ticketsAll}
                    icon={CircleCheck}
                    label={t('dash_closed_14d')}
                    value={it.closed.total}
                    unit={t('dash_unit_cases')}
                    footer={<SparkFooter text={peak(it.closed.peak)} values={it.closed.series} className="text-emerald-500" />}
                />
                <DashTile
                    to={links.ticketsOverview}
                    icon={Target}
                    label={t('dash_sla_30d')}
                    value={rate === null ? '—' : rate}
                    unit={rate === null ? undefined : '%'}
                    alert={belowGoal ? 'red' : undefined}
                    badge={<StatusBadge tone="green">{t('dash_goal_n').replace('{n}', String(goal))}</StatusBadge>}
                    meter={rate === null ? undefined : { value: rate, goal }}
                    footer={
                        <span className={cn(belowGoal && 'text-red-600 dark:text-red-400')}>
                            {rate === null
                                ? t('dash_no_measured')
                                : rate >= goal
                                  ? t('dash_goal_met')
                                  : t('dash_below_goal').replace('{n}', String(Math.round((goal - rate) * 10) / 10))}
                        </span>
                    }
                />
                <DashTile
                    to={links.ticketsOverview}
                    icon={Timer}
                    label={t('rep_kpi_avg')}
                    value={it.avg_resolve_hours ?? '—'}
                    unit={it.avg_resolve_hours === null ? undefined : t('dash_unit_hours')}
                    footer={t('dash_last_30d')}
                />
            </div>
            <div className={cn(PAIR_GRID, row.anyOpen && 'xl:items-start')}>
                <OpenedPerDayCard volume={it.volume} cardRef={row.left} heldHeight={row.heldLeft} />
                <WorkloadCard
                    it={it}
                    open={row.open.workload}
                    onToggle={() => row.toggle('workload')}
                    cardRef={row.right}
                    heldHeight={row.heldRight}
                />
            </div>
        </section>
    );
}
