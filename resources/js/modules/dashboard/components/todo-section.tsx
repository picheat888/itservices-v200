// Dashboard "งานที่รอคุณ": tiles that ask the reader to act, in priority order; the section hides when none apply.
import { useT } from '@/lang';
import { FILL } from '@/modules/report';
import { StatusBadge } from '@/shared/components/status-badge';
import { useUiStore } from '@/stores/ui';
import { CircleCheckBig, FileText, Inbox, Package, PackageCheck, UserX, Wrench } from 'lucide-react';
import type { DashboardSummary } from '../api/dashboardApi';
import { useDashLinks } from '../hooks/use-dash-links';
import { sharePieces } from '../lib/dash-math';
import { groupPendingAssets } from '../lib/pending-groups';
import { DashTile, LegendFooter, SectionHeading, TILE_GRID } from './dash-parts';

export function TodoSection({ data }: { data: DashboardSummary }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const links = useDashLinks();
    const { my_jobs: jobs, approvals, pending_acceptance: toAccept } = data.mine.todo;
    const waiting = data.it?.waiting;
    const awaitingIt = data.requests?.awaiting_it;
    const expiring = data.contracts?.expiring;
    const oldest = (days: number) => t('dash_oldest_days').replace('{n}', String(days));
    const groups = groupPendingAssets(toAccept, lang);

    const tiles = [
        jobs && (
            <DashTile
                key="jobs"
                to={links.myJobs}
                icon={Wrench}
                label={t('ticket_tab_mine')}
                value={jobs.total}
                unit={t('dash_unit_cases')}
                alert={jobs.over_sla > 0 ? 'red' : undefined}
                bar={sharePieces([
                    { key: 'over', value: jobs.over_sla, className: FILL.red },
                    { key: 'soon', value: jobs.due_soon, className: FILL.amber },
                    { key: 'ok', value: jobs.on_track, className: FILL.green },
                ])}
                footer={
                    <LegendFooter
                        items={[
                            { key: 'over', label: t('rep_sla_over_sla'), value: jobs.over_sla, dot: FILL.red },
                            { key: 'soon', label: t('rep_sla_due_soon'), value: jobs.due_soon, dot: FILL.amber },
                            { key: 'ok', label: t('rep_sla_on_track'), value: jobs.on_track, dot: FILL.green },
                        ]}
                    />
                }
            />
        ),
        waiting && (
            <DashTile
                key="pickup"
                to={links.pickup}
                icon={UserX}
                label={t('dash_todo_pickup')}
                value={waiting.count}
                unit={t('dash_unit_cases')}
                alert={waiting.count > 0 ? 'amber' : undefined}
                footer={waiting.count > 0 ? oldest(waiting.oldest_days) : undefined}
            />
        ),
        approvals && (
            <DashTile
                key="approvals"
                to={links.approvals}
                icon={Inbox}
                label={t('dash_todo_approvals')}
                value={approvals.count}
                unit={t('dash_unit_requests')}
                alert="amber"
                footer={oldest(approvals.oldest_days)}
            />
        ),
        awaitingIt && (
            <DashTile
                key="awaiting-it"
                to={links.awaitingIt}
                icon={Package}
                label={t('dash_todo_awaiting_it')}
                value={awaitingIt.count}
                unit={t('dash_unit_requests')}
                bar={sharePieces([
                    { key: 'le7', value: awaitingIt.le7, className: FILL.green },
                    { key: 'd8_14', value: awaitingIt.d8_14, className: FILL.amber },
                    { key: 'gt14', value: awaitingIt.gt14, className: FILL.red },
                ])}
                footer={
                    <LegendFooter
                        items={[
                            { key: 'le7', label: t('dash_age_le7'), value: awaitingIt.le7, dot: FILL.green },
                            { key: 'd8_14', label: t('dash_age_8_14'), value: awaitingIt.d8_14, dot: FILL.amber },
                            { key: 'gt14', label: t('dash_age_gt14'), value: awaitingIt.gt14, dot: FILL.red },
                        ]}
                    />
                }
            />
        ),
        expiring && (
            <DashTile
                key="expiring"
                to={links.expiring}
                icon={FileText}
                label={t('dash_todo_contracts')}
                value={expiring.total}
                unit={t('dash_unit_contracts')}
                badge={
                    expiring.overdue > 0 ? (
                        <StatusBadge tone="red">{t('dash_overdue_n').replace('{n}', String(expiring.overdue))}</StatusBadge>
                    ) : undefined
                }
                bar={sharePieces([
                    { key: 'd30', value: expiring.d30, className: FILL.amber },
                    { key: 'later', value: expiring.d31_plus, className: FILL['soft-amber'] },
                ])}
                footer={
                    <LegendFooter
                        items={[
                            { key: 'd30', label: t('dash_in_30'), value: expiring.d30, dot: FILL.amber },
                            { key: 'later', label: t('dash_after_30'), value: expiring.d31_plus, dot: FILL['soft-amber'] },
                        ]}
                    />
                }
            />
        ),
        toAccept.length > 0 && (
            <DashTile
                key="accept"
                to={links.profileAssets}
                icon={PackageCheck}
                label={t('dash_todo_accept')}
                value={toAccept.length}
                unit={t('dash_unit_items')}
                alert="amber"
                footer={
                    groups.length > 1
                        ? t('dash_accept_more')
                              .replace('{model}', groups[0].model)
                              .replace('{n}', String(groups.length - 1))
                        : groups[0]?.model
                }
            />
        ),
    ].filter(Boolean);

    if (tiles.length === 0) return null;

    return (
        <section aria-labelledby="dash-todo" className="space-y-3">
            <SectionHeading id="dash-todo" icon={CircleCheckBig} title={t('dash_sec_todo')} note={t('dash_sec_todo_sub')} />
            <div className={TILE_GRID}>{tiles}</div>
        </section>
    );
}
