// Overview tab: the four summary tiles. Two act on right now (past SLA, waiting for pickup),
// two read the chosen window (SLA as the report counts it, opened vs closed).
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { TicketSummary } from '@/shared/types';
import { Card } from '@/shared/ui/card';
import { ArrowDown, ArrowUp, ChevronRight, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const fmt = (n: number) => n.toLocaleString('en-US');

/** ▲/▼ change in SLA points: up = green, down = red. */
function PointsTrend({ delta }: { delta: number }) {
    const t = useT();
    const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;
    const tone = delta === 0 ? 'text-muted-foreground' : delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
    return (
        <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', tone)}>
            <Icon className="h-3.5 w-3.5" />
            {delta === 0 ? t('ticket_trend_flat') : `${Math.abs(Math.round(delta))} ${t('ticket_pts')}`}
        </span>
    );
}

function When({ children }: { children: ReactNode }) {
    return <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap">{children}</span>;
}

function TileFoot({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <span className={cn('border-border/70 mt-auto flex items-center justify-between border-t pt-2.5 text-xs font-semibold', className)}>
            {children}
            <ChevronRight className="h-3.5 w-3.5" />
        </span>
    );
}

const ACTION_TONE = {
    red: {
        tile: 'border-red-200 bg-red-50/70 hover:bg-red-50 dark:border-red-900/60 dark:bg-red-950/30 dark:hover:bg-red-950/50',
        ink: 'text-red-700 dark:text-red-400',
    },
    amber: {
        tile: 'border-amber-200 bg-amber-50/70 hover:bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30 dark:hover:bg-amber-950/50',
        ink: 'text-amber-700 dark:text-amber-400',
    },
};

/** A right-now count; with work waiting the whole tile opens the filtered list. */
function ActionTile({
    tone,
    label,
    value,
    lead,
    detail,
    okText,
    onOpen,
}: {
    tone: 'red' | 'amber';
    label: string;
    value: number;
    lead: string;
    detail: string | null;
    okText: string;
    onOpen: () => void;
}) {
    const t = useT();
    const active = value > 0;
    const ink = active ? ACTION_TONE[tone].ink : 'text-emerald-600 dark:text-emerald-400';
    const body = (
        <>
            <span className="flex items-center justify-between gap-2">
                <span className={cn('text-sm font-semibold', active && ink)}>{label}</span>
                <When>{t('ticket_kpi_now')}</When>
            </span>
            <span className="flex items-baseline gap-2">
                <span className={cn('font-mono text-3xl leading-none font-bold', ink)}>{fmt(value)}</span>
                <span className="text-muted-foreground text-xs">{active ? lead : okText}</span>
            </span>
            <span className="text-muted-foreground min-h-4 text-xs">{active ? detail : null}</span>
            {active && (
                <TileFoot
                    className={cn(ink, tone === 'red' ? 'border-red-200/70 dark:border-red-900/50' : 'border-amber-200/70 dark:border-amber-900/50')}
                >
                    {t('ticket_tile_open_list')}
                </TileFoot>
            )}
        </>
    );
    const shell = 'flex h-full flex-col gap-2.5 rounded-xl border p-5 text-left';
    if (!active) {
        return <div className={cn(shell, 'bg-card border-border')}>{body}</div>;
    }
    return (
        <button type="button" onClick={onOpen} className={cn(shell, 'transition-colors', ACTION_TONE[tone].tile)}>
            {body}
        </button>
    );
}

/** Fill color by distance to the goal: met = green, within 10 points = amber, else red. */
const slaInk = (rate: number, goal: number) => (rate >= goal ? 'emerald' : rate >= goal - 10 ? 'amber' : 'red');
const SLA_BAR = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' };
const SLA_TEXT = { emerald: 'text-foreground', amber: 'text-foreground', red: 'text-red-600 dark:text-red-400' };

function SlaTile({ sla, when, reportHref }: { sla: TicketSummary['period_sla']; when: string; reportHref: string | null }) {
    const t = useT();
    const split = [
        { key: 'ticket_tile_sla_from_request', rate: sla.request_rate },
        { key: 'ticket_tile_sla_manual', rate: sla.manual_rate },
    ];
    return (
        <Card className="flex h-full flex-col gap-2.5 p-5">
            <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{t('ticket_tile_sla')}</span>
                <When>{when}</When>
            </span>
            {sla.rate == null ? (
                <span className="text-muted-foreground py-3 text-xs">{t('ticket_tile_sla_none')}</span>
            ) : (
                <>
                    <span className="flex items-baseline gap-2">
                        <span className="font-mono text-3xl leading-none font-bold">{Math.round(sla.rate)}%</span>
                        {sla.delta_pts != null && <PointsTrend delta={sla.delta_pts} />}
                    </span>
                    <span className="bg-muted relative h-2 rounded-full" title={t('ticket_tile_sla_goal_plain').replace('{goal}', String(sla.goal))}>
                        <span className={cn('block h-full rounded-full', SLA_BAR[slaInk(sla.rate, sla.goal)])} style={{ width: `${sla.rate}%` }} />
                        <span className="bg-foreground absolute -top-1 h-4 w-0.5 rounded-sm" style={{ left: `${sla.goal}%` }} />
                    </span>
                    <span className="text-muted-foreground text-xs">
                        {t('ticket_tile_sla_count').replace('{met}', fmt(sla.met)).replace('{n}', fmt(sla.measured))}
                    </span>
                    <span className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
                        {split.map((s) => (
                            <span key={s.key} className="contents">
                                <span className="text-muted-foreground">{t(s.key)}</span>
                                <b
                                    className={cn(
                                        'text-right font-mono',
                                        s.rate == null ? 'text-muted-foreground' : SLA_TEXT[slaInk(s.rate, sla.goal)],
                                    )}
                                >
                                    {s.rate == null ? '—' : `${Math.round(s.rate)}%`}
                                </b>
                            </span>
                        ))}
                    </span>
                </>
            )}
            {reportHref ? (
                <Link to={reportHref} className="text-brand hover:text-brand/80 mt-auto">
                    <TileFoot>{t('ticket_tile_sla_goal').replace('{goal}', String(sla.goal))}</TileFoot>
                </Link>
            ) : (
                <span className="text-muted-foreground border-border/70 mt-auto border-t pt-2.5 text-xs">
                    {t('ticket_tile_sla_goal_plain').replace('{goal}', String(sla.goal))}
                </span>
            )}
        </Card>
    );
}

function FlowTile({ summary, when, reportHref }: { summary: TicketSummary; when: string; reportHref: string | null }) {
    const t = useT();
    const net = summary.created - summary.resolved;
    const max = Math.max(1, ...summary.flow.flatMap((s) => [s.opened, s.closed]));
    const tone = net > 0 ? 'text-red-600 dark:text-red-400' : net < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground';
    return (
        <Card className="flex h-full flex-col gap-2.5 p-5">
            <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{t('ticket_tile_flow')}</span>
                <When>{when}</When>
            </span>
            <span className="flex items-end justify-between gap-3">
                <span className="flex flex-col gap-1">
                    <span className={cn('font-mono text-3xl leading-none font-bold', tone)}>{net > 0 ? `+${fmt(net)}` : fmt(net)}</span>
                    <span className="text-muted-foreground text-xs">
                        {t(net > 0 ? 'ticket_tile_flow_up' : net < 0 ? 'ticket_tile_flow_down' : 'ticket_tile_flow_even')}
                    </span>
                </span>
                <span className="flex h-11 items-end gap-1.5" aria-hidden="true">
                    {summary.flow.map((s, i) => (
                        <span key={i} className="flex items-end gap-0.5">
                            <span className="bg-brand/45 w-1.5 rounded-t-sm" style={{ height: `${Math.max(2, (s.opened / max) * 44)}px` }} />
                            <span className="w-1.5 rounded-t-sm bg-emerald-500" style={{ height: `${Math.max(2, (s.closed / max) * 44)}px` }} />
                        </span>
                    ))}
                </span>
            </span>
            <span className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5">
                    <span className="bg-brand/45 h-2 w-2 rounded-sm" />
                    {t('ticket_tile_opened')} <b className="text-foreground font-mono">{fmt(summary.created)}</b>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-emerald-500" />
                    {t('ticket_tile_closed')} <b className="text-foreground font-mono">{fmt(summary.resolved)}</b>
                </span>
            </span>
            {reportHref && (
                <Link to={reportHref} className="text-brand hover:text-brand/80 mt-auto">
                    <TileFoot>{t('rep_tickets_overview_title')}</TileFoot>
                </Link>
            )}
        </Card>
    );
}

export function TicketOverviewTiles({
    summary,
    when,
    canOpenReport,
    onOpenOverSla,
    onOpenWaiting,
}: {
    summary: TicketSummary;
    /** The window's label for the two period tiles ("30 วัน" or a custom range). */
    when: string;
    canOpenReport: boolean;
    onOpenOverSla: () => void;
    onOpenWaiting: () => void;
}) {
    const t = useT();
    const live = summary.backlog_open + summary.backlog_in_progress;
    const reportHref = canOpenReport ? `/reports/tickets-overview?from=${summary.period_sla.from}&to=${summary.period_sla.to}` : null;
    return (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <ActionTile
                tone="red"
                label={t('ticket_tile_over_sla')}
                value={summary.over_sla_now}
                lead={t('ticket_tile_of_live').replace('{n}', fmt(live))}
                detail={summary.over_sla_oldest_days == null ? null : t('ticket_tile_oldest').replace('{n}', fmt(summary.over_sla_oldest_days))}
                okText={t('ticket_dash_over_sla_ok_sub')}
                onOpen={onOpenOverSla}
            />
            <ActionTile
                tone="amber"
                label={t('ticket_tile_waiting')}
                value={summary.backlog_open}
                lead={t('ticket_tile_unassigned')}
                detail={summary.backlog_in_progress > 0 ? t('ticket_tile_working').replace('{n}', fmt(summary.backlog_in_progress)) : null}
                okText={t('ticket_dash_waiting_ok_sub')}
                onOpen={onOpenWaiting}
            />
            <SlaTile sla={summary.period_sla} when={when} reportHref={reportHref} />
            <FlowTile summary={summary} when={when} reportHref={reportHref} />
        </div>
    );
}
