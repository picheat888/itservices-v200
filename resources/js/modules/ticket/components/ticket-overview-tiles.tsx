// Overview tab: the four summary tiles. Two act on right now (past SLA, waiting for pickup),
// two read the chosen window (SLA as the report counts it, opened vs closed).
import { useT } from '@/lang';
import { StatCard, StatGrid } from '@/shared/components/stat-card';
import { slaLevel, type SlaLevel } from '@/shared/lib/sla-level';
import { cn } from '@/shared/lib/utils';
import type { TicketSummary } from '@/shared/types';
import { AlertTriangle, ArrowDown, ArrowUp, Clock, Gauge, Inbox, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const fmt = (n: number) => n.toLocaleString('en-US');

const RED_SMALL = 'text-red-700 dark:text-red-400';
const GREEN_SMALL = 'text-emerald-700 dark:text-emerald-400';
const SLA_TONE: Record<SlaLevel, 'green' | 'amber' | 'red'> = { met: 'green', near: 'amber', miss: 'red' };
const SLA_FILL: Record<SlaLevel, string> = { met: 'bg-emerald-500', near: 'bg-amber-500', miss: 'bg-red-500' };
const TILE_LINK = 'group focus-visible:ring-ring block h-full rounded-lg text-left focus-visible:ring-2 focus-visible:outline-none';

/** ▲/▼ change in SLA points: up = green, down = red. */
function PointsTrend({ delta }: { delta: number }) {
    const t = useT();
    const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;
    return (
        <span
            className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                delta === 0 ? 'text-muted-foreground' : delta > 0 ? GREEN_SMALL : RED_SMALL,
            )}
        >
            <Icon className="h-3.5 w-3.5" />
            {delta === 0 ? t('ticket_trend_flat') : `${Math.abs(Math.round(delta))} ${t('ticket_pts')}`}
        </span>
    );
}

/** Opened vs closed in six slices of the window, small enough to sit beside the number. */
function FlowBars({ flow }: { flow: TicketSummary['flow'] }) {
    const max = Math.max(1, ...flow.flatMap((s) => [s.opened, s.closed]));
    const height = (n: number) => `${Math.max(2, Math.round((n / max) * 28))}px`;
    return (
        <span className="mb-1 flex h-7 items-end gap-1" aria-hidden="true">
            {flow.map((s, i) => (
                <span key={i} className="flex items-end gap-px">
                    <span className="bg-brand/50 w-1 rounded-t-sm" style={{ height: height(s.opened) }} />
                    <span className="w-1 rounded-t-sm bg-emerald-500" style={{ height: height(s.closed) }} />
                </span>
            ))}
        </span>
    );
}

/** The window's SLA against its goal tick, sized to sit beside the number. */
function SlaBar({ rate, goal }: { rate: number; goal: number }) {
    return (
        <span className="dark:bg-muted relative mb-2.5 h-2 max-w-40 flex-1 rounded-full bg-slate-200" aria-hidden="true">
            <span className={cn('block h-full rounded-full', SLA_FILL[slaLevel(rate, goal)])} style={{ width: `${Math.min(100, rate)}%` }} />
            <span className="bg-foreground absolute -top-1 h-4 w-0.5 rounded-sm" style={{ left: `${goal}%` }} />
        </span>
    );
}

/** A tile that opens the report on the same window, or stays plain without the report right. */
function ReportLink({ href, children }: { href: string | null; children: ReactNode }) {
    if (!href) return children;
    return (
        <Link to={href} className={TILE_LINK}>
            {children}
        </Link>
    );
}

export function TicketOverviewTiles({
    summary,
    canOpenReport,
    onOpenOverSla,
    onOpenWaiting,
}: {
    summary: TicketSummary;
    canOpenReport: boolean;
    onOpenOverSla: () => void;
    onOpenWaiting: () => void;
}) {
    const t = useT();
    const sla = summary.period_sla;
    const live = summary.backlog_open + summary.backlog_in_progress;
    const net = summary.created - summary.resolved;
    const reportHref = canOpenReport ? `/reports/tickets-overview?from=${sla.from}&to=${sla.to}` : null;
    const pct = (rate: number | null) => (rate == null ? '—' : `${Math.round(rate)}%`);
    const linked = reportHref ? 'group-hover:border-brand/40 h-full' : 'h-full';
    const ofLive = t('ticket_tile_of_live').replace('{n}', fmt(live));
    const oldest = t('ticket_tile_oldest').replace('{n}', fmt(summary.over_sla_oldest_days ?? 0));
    const split = (key: string) => t(key).replace('{request}', pct(sla.request_rate)).replace('{manual}', pct(sla.manual_rate));

    return (
        <StatGrid count={4}>
            <StatCard
                label={t('ticket_tile_over_sla')}
                icon={AlertTriangle}
                value={summary.over_sla_now}
                tone={summary.over_sla_now > 0 ? 'red' : 'green'}
                alert={summary.over_sla_now > 0 ? 'red' : undefined}
                onClick={summary.over_sla_now > 0 ? onOpenOverSla : undefined}
                className="h-full"
                footer={summary.over_sla_now === 0 ? t('ticket_dash_over_sla_ok_sub') : summary.over_sla_oldest_days != null ? oldest : ofLive}
                footerTitle={
                    summary.over_sla_now > 0 ? [ofLive, summary.over_sla_oldest_days != null && oldest].filter(Boolean).join(' ') : undefined
                }
            />
            <StatCard
                label={t('ticket_tile_waiting')}
                icon={Clock}
                value={summary.backlog_open}
                tone={summary.backlog_open > 0 ? 'amber' : 'green'}
                alert={summary.backlog_open > 0 ? 'amber' : undefined}
                onClick={summary.backlog_open > 0 ? onOpenWaiting : undefined}
                className="h-full"
                footer={
                    summary.backlog_open > 0
                        ? t('ticket_tile_working').replace('{n}', fmt(summary.backlog_in_progress))
                        : t('ticket_dash_waiting_ok_sub')
                }
            />
            <ReportLink href={reportHref}>
                <StatCard
                    label={t('ticket_tile_sla').replace('{goal}', String(sla.goal))}
                    icon={Gauge}
                    value={pct(sla.rate)}
                    tone={sla.rate == null ? undefined : SLA_TONE[slaLevel(sla.rate, sla.goal)]}
                    aside={sla.rate == null ? null : <SlaBar rate={sla.rate} goal={sla.goal} />}
                    footerTitle={sla.rate == null ? undefined : split('ticket_tile_sla_split')}
                    className={linked}
                    footer={
                        sla.rate == null ? (
                            t('ticket_tile_sla_none')
                        ) : (
                            <span className="inline-flex items-center gap-1.5">
                                {sla.delta_pts != null && <PointsTrend delta={sla.delta_pts} />}
                                {split('ticket_tile_sla_split_short')}
                            </span>
                        )
                    }
                />
            </ReportLink>
            <ReportLink href={reportHref}>
                <StatCard
                    label={t(net > 0 ? 'ticket_tile_flow_up' : net < 0 ? 'ticket_tile_flow_down' : 'ticket_tile_flow_even')}
                    icon={Inbox}
                    value={Math.abs(net)}
                    tone={net > 0 ? 'red' : net < 0 ? 'green' : undefined}
                    aside={<FlowBars flow={summary.flow} />}
                    footerTitle={`${t('ticket_tile_flow_opened').replace('{n}', fmt(summary.created))} ${t('ticket_tile_flow_closed').replace('{n}', fmt(summary.resolved))}`}
                    className={linked}
                    footer={
                        <span className="inline-flex items-center gap-1.5">
                            <span className="bg-brand/50 h-2 w-2 rounded-sm" />
                            {t('ticket_tile_flow_opened_short').replace('{n}', fmt(summary.created))}
                            <span className="ml-1 h-2 w-2 rounded-sm bg-emerald-500" />
                            {t('ticket_tile_flow_closed_short').replace('{n}', fmt(summary.resolved))}
                        </span>
                    }
                />
            </ReportLink>
        </StatGrid>
    );
}
