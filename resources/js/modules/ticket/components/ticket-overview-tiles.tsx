// Overview tab: the four summary tiles. Two act on right now (past SLA, waiting for pickup),
// two read the chosen window (SLA as the report counts it, opened vs closed).
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { TicketSummary } from '@/shared/types';
import { Card } from '@/shared/ui/card';
import { AlertTriangle, ArrowDown, ArrowUp, Clock, Gauge, Inbox, Minus, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const fmt = (n: number) => n.toLocaleString('en-US');

const RED = 'text-red-600 dark:text-red-400';
const AMBER = 'text-amber-600 dark:text-amber-400';
const GREEN = 'text-emerald-600 dark:text-emerald-400';
const PRESSABLE = 'group focus-visible:ring-ring block h-full rounded-xl text-left focus-visible:ring-2 focus-visible:outline-none';

/** ▲/▼ change in SLA points: up = green, down = red. */
function PointsTrend({ delta }: { delta: number }) {
    const t = useT();
    const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;
    return (
        <span className={cn('inline-flex items-center gap-0.5 font-medium', delta === 0 ? 'text-muted-foreground' : delta > 0 ? GREEN : RED)}>
            <Icon className="h-3.5 w-3.5" />
            {delta === 0 ? t('ticket_trend_flat') : `${Math.abs(Math.round(delta))} ${t('ticket_pts')}`}
        </span>
    );
}

/** The module KPI card (Asset, Stock, Contract): label + icon, a big number, one hint line. */
function Tile({
    label,
    icon: Icon,
    value,
    valueTone,
    hint,
    chart,
}: {
    label: string;
    icon: LucideIcon;
    value: string;
    valueTone?: string;
    hint: ReactNode;
    chart?: ReactNode;
}) {
    return (
        <Card className="group-hover:border-brand/40 h-full p-5 transition-colors">
            <div className="flex items-start justify-between">
                <div className="text-muted-foreground text-sm">{label}</div>
                <span className="bg-brand/10 text-brand flex h-9 w-9 items-center justify-center rounded-lg">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
                <div className={cn('font-mono text-3xl font-bold', valueTone)}>{value}</div>
                {chart}
            </div>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 text-xs">{hint}</div>
        </Card>
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

/** SLA tone by distance to the goal: met = green, within 10 points = amber, else red. */
const slaTone = (rate: number, goal: number) => (rate >= goal ? GREEN : rate >= goal - 10 ? AMBER : RED);

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

    const overSla = (
        <Tile
            label={t('ticket_tile_over_sla')}
            icon={AlertTriangle}
            value={fmt(summary.over_sla_now)}
            valueTone={summary.over_sla_now > 0 ? RED : undefined}
            hint={
                summary.over_sla_now > 0
                    ? [
                          t('ticket_tile_of_live').replace('{n}', fmt(live)),
                          summary.over_sla_oldest_days != null && t('ticket_tile_oldest').replace('{n}', fmt(summary.over_sla_oldest_days)),
                      ]
                          .filter(Boolean)
                          .join(' ')
                    : t('ticket_dash_over_sla_ok_sub')
            }
        />
    );
    const waiting = (
        <Tile
            label={t('ticket_tile_waiting')}
            icon={Clock}
            value={fmt(summary.backlog_open)}
            valueTone={summary.backlog_open > 0 ? AMBER : undefined}
            hint={
                summary.backlog_open > 0 ? t('ticket_tile_working').replace('{n}', fmt(summary.backlog_in_progress)) : t('ticket_dash_waiting_ok_sub')
            }
        />
    );
    const slaTile = (
        <Tile
            label={t('ticket_tile_sla').replace('{goal}', String(sla.goal))}
            icon={Gauge}
            value={pct(sla.rate)}
            valueTone={sla.rate == null ? undefined : slaTone(sla.rate, sla.goal)}
            hint={
                sla.rate == null ? (
                    t('ticket_tile_sla_none')
                ) : (
                    <>
                        {sla.delta_pts != null && <PointsTrend delta={sla.delta_pts} />}
                        <span>
                            {t('ticket_tile_sla_split').replace('{request}', pct(sla.request_rate)).replace('{manual}', pct(sla.manual_rate))}
                        </span>
                    </>
                )
            }
        />
    );
    const flowTile = (
        <Tile
            label={t(net > 0 ? 'ticket_tile_flow_up' : net < 0 ? 'ticket_tile_flow_down' : 'ticket_tile_flow_even')}
            icon={Inbox}
            value={fmt(Math.abs(net))}
            valueTone={net > 0 ? RED : net < 0 ? GREEN : undefined}
            hint={
                <>
                    <span className="bg-brand/50 h-2 w-2 rounded-sm" />
                    {t('ticket_tile_flow_opened').replace('{n}', fmt(summary.created))}
                    <span className="ml-2 h-2 w-2 rounded-sm bg-emerald-500" />
                    {t('ticket_tile_flow_closed').replace('{n}', fmt(summary.resolved))}
                </>
            }
            chart={<FlowBars flow={summary.flow} />}
        />
    );

    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {summary.over_sla_now > 0 ? (
                <button type="button" onClick={onOpenOverSla} className={PRESSABLE}>
                    {overSla}
                </button>
            ) : (
                overSla
            )}
            {summary.backlog_open > 0 ? (
                <button type="button" onClick={onOpenWaiting} className={PRESSABLE}>
                    {waiting}
                </button>
            ) : (
                waiting
            )}
            {reportHref ? (
                <Link to={reportHref} className={PRESSABLE}>
                    {slaTile}
                </Link>
            ) : (
                slaTile
            )}
            {reportHref ? (
                <Link to={reportHref} className={PRESSABLE}>
                    {flowTile}
                </Link>
            ) : (
                flowTile
            )}
        </div>
    );
}
