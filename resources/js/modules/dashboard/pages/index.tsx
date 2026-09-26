import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { useContractSummary } from '@/modules/contract';
import { StatusBadge } from '@/shared/components/status-badge';
import { relativeTime } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { Box, Building2, Check, FileText, History, Inbox, type LucideIcon, PackageCheck, Ticket, UserMinus, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
    ActivityRow,
    DashboardHr,
    DashboardIt,
    DashboardRequests,
    MyAssetRow,
    MyRequestRow,
    MyTicketRow,
    WaitingRequestRow,
} from '../api/dashboardApi';
import { useDashboardSummary } from '../hooks/use-dashboard';

/** Badge tone per ticket / request status — the same colours the module pages use. */
const statusTone: Record<string, 'blue' | 'green' | 'amber' | 'gray' | 'red'> = {
    open: 'blue',
    in_progress: 'amber',
    completed: 'green',
    canceled: 'gray',
    // Requests have their own Pending; tickets do not.
    pending: 'amber',
    approved: 'blue',
    fulfilled: 'green',
    rejected: 'red',
    cancelled: 'gray',
    deployed: 'green',
    pending_acceptance: 'amber',
};

/** One headline number. `to` makes the whole card a link to the page behind it. */
function StatCard({ label, value, icon: Icon, to }: { label: string; value: number; icon: LucideIcon; to: string }) {
    return (
        <Card className="hover:border-brand/40 p-5 transition-colors">
            <Link to={to} className="block">
                <div className="flex items-start justify-between">
                    <div className="text-muted-foreground text-sm">{label}</div>
                    <span className="bg-brand/10 text-brand flex h-9 w-9 items-center justify-center rounded-lg">
                        <Icon className="h-[18px] w-[18px]" />
                    </span>
                </div>
                <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
            </Link>
        </Card>
    );
}

/** A list card: title, a "view all" link, and either rows or a line saying why there are none. */
function ListCard({
    title,
    icon: Icon,
    to,
    empty,
    children,
    rows,
}: {
    title: string;
    icon: LucideIcon;
    to: string;
    empty: string;
    children: React.ReactNode;
    rows: number;
}) {
    const t = useT();
    return (
        <Card className="overflow-hidden">
            <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
                <div className="flex items-center gap-2">
                    <Icon className="text-muted-foreground h-4 w-4" />
                    <span className="font-semibold">{title}</span>
                </div>
                <Link to={to} className="text-muted-foreground hover:text-foreground text-xs font-medium">
                    {t('view_all')} →
                </Link>
            </div>
            {rows === 0 ? <div className="text-muted-foreground px-5 py-8 text-center text-sm">{empty}</div> : children}
        </Card>
    );
}

/** Shared row shell for every list card — a lead line, a sub-line, and a badge or a time. */
function Row({ lead, sub, status, trailing }: { lead: React.ReactNode; sub?: React.ReactNode; status?: string; trailing?: React.ReactNode }) {
    return (
        <div className="border-border/60 flex items-center justify-between gap-3 border-b px-5 py-2.5 last:border-0">
            <div className="min-w-0">
                <div className="truncate text-sm font-medium">{lead}</div>
                {sub && <div className="text-muted-foreground truncate text-xs">{sub}</div>}
            </div>
            {status && (
                <StatusBadge tone={statusTone[status] ?? 'gray'}>
                    <span className="capitalize">{status.replace('_', ' ')}</span>
                </StatusBadge>
            )}
            {trailing}
        </div>
    );
}

/** Slice order round the circle — the life of a case, not biggest-first. */
const STATUS_ORDER = ['open', 'in_progress', 'completed', 'canceled'] as const;

/**
 * Arc and legend-dot colour per status, one step lighter in dark mode the way the badges are.
 *
 * In progress is amber, not the violet its badge wears. The badge can afford violet because it
 * carries its own word; two arcs side by side cannot. Against the brand blue, violet-500 scores
 * ΔE 2.3 for protanopia and 12.7 even with full colour vision — the two biggest slices of this
 * chart, unreadable as a pair. Amber clears both floors in light and dark
 * (scripts/validate_palette.js, the dataviz skill). Canceled stays the neutral grey on purpose:
 * it is a state that has stopped, not a category competing for the eye.
 */
const STATUS_ARC: Record<(typeof STATUS_ORDER)[number], string> = {
    open: 'stroke-blue-500 dark:stroke-blue-400',
    in_progress: 'stroke-amber-500 dark:stroke-amber-400',
    completed: 'stroke-emerald-500 dark:stroke-emerald-400',
    canceled: 'stroke-gray-400 dark:stroke-gray-500',
};

const STATUS_DOT: Record<(typeof STATUS_ORDER)[number], string> = {
    open: 'bg-blue-500 dark:bg-blue-400',
    in_progress: 'bg-amber-500 dark:bg-amber-400',
    completed: 'bg-emerald-500 dark:bg-emerald-400',
    canceled: 'bg-gray-400 dark:bg-gray-500',
};

const DONUT = { size: 148, radius: 60, width: 18, gap: 2 };
const CIRCUMFERENCE = 2 * Math.PI * DONUT.radius;

/**
 * How the last 30 days of cases split.
 *
 * A ring, with the total in the hole — the one number a reader wants before the breakdown,
 * in the one place a ring leaves free. The legend is a two-column grid rather than a single
 * list: at half the page width a single column left the right third of the card empty, and
 * stretching one column instead would only push each number away from its own label.
 *
 * The counts live in the legend, not on the arcs: a ring answers "how is it divided", and a
 * reader after "how many exactly" should not have to hover or squint. Percentages sit beside
 * them because angles are hard to compare by eye — the known weakness of this form, paid for
 * in the legend. Every slice is named there too, so identity never rests on colour alone.
 * Arcs are cut apart by a 2px surface-coloured gap, which is also what keeps two touching
 * slices apart in print and in forced-colours mode.
 */
function TicketsOverviewCard({ it }: { it: DashboardIt }) {
    const t = useT();
    const entries = STATUS_ORDER.map((key) => [key, it.by_status[key]] as const);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);

    // Walk the ring once, handing each slice its length and where it starts.
    const present = entries.filter(([, value]) => value > 0);
    let cursor = 0;
    const slices = present.map(([key, value]) => {
        const length = (value / total) * CIRCUMFERENCE;
        const offset = cursor;
        cursor += length;
        // A single slice filling the whole ring needs no gap cut out of itself.
        const drawn = Math.max(length - (present.length > 1 ? DONUT.gap : 0), 0.5);

        return { key, value, drawn, offset };
    });

    return (
        <Card className="overflow-hidden">
            <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
                <div className="flex items-center gap-2">
                    <Ticket className="text-muted-foreground h-4 w-4" />
                    <span className="font-semibold">{t('dash_tickets_overview')}</span>
                </div>
                <span className="text-muted-foreground text-xs">
                    {t('dash_last_days').replace('{n}', String(it.window_days))} · <b className="text-foreground font-mono font-semibold">{total}</b>{' '}
                    {t('dash_cases')}
                </span>
            </div>
            <div className="p-5">
                {total === 0 ? (
                    <div className="text-muted-foreground py-12 text-center text-sm">{t('dash_empty_window')}</div>
                ) : (
                    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6 sm:flex-nowrap sm:justify-start">
                        <div className="relative shrink-0" style={{ width: DONUT.size, height: DONUT.size }}>
                            <svg
                                viewBox={`0 0 ${DONUT.size} ${DONUT.size}`}
                                className="-rotate-90"
                                role="img"
                                aria-label={`${t('dash_tickets_overview')}: ${total}`}
                            >
                                <circle
                                    cx={DONUT.size / 2}
                                    cy={DONUT.size / 2}
                                    r={DONUT.radius}
                                    fill="none"
                                    strokeWidth={DONUT.width}
                                    className="stroke-secondary"
                                />
                                {slices.map((slice) => (
                                    <circle
                                        key={slice.key}
                                        cx={DONUT.size / 2}
                                        cy={DONUT.size / 2}
                                        r={DONUT.radius}
                                        fill="none"
                                        strokeWidth={DONUT.width}
                                        strokeDasharray={`${slice.drawn} ${CIRCUMFERENCE - slice.drawn}`}
                                        strokeDashoffset={-slice.offset}
                                        className={STATUS_ARC[slice.key]}
                                    >
                                        <title>{`${t(`ticket_${slice.key}`)}: ${slice.value}`}</title>
                                    </circle>
                                ))}
                            </svg>
                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                <span className="font-mono text-[28px] leading-none font-bold">{total}</span>
                                <span className="text-muted-foreground mt-1 text-[11px]">{t('dash_cases')}</span>
                            </div>
                        </div>

                        {/* Two columns, filling the width the ring leaves: one column stopped
                            a third short of the card's right edge, and stretching it would
                            only walk each number away from the label it belongs to. */}
                        <ul className="grid flex-1 grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                            {entries.map(([key, value]) => (
                                <li key={key} className="flex items-baseline gap-2 text-sm">
                                    <span className={cn('h-2 w-2 shrink-0 translate-y-[-1px] rounded-full', STATUS_DOT[key])} />
                                    <span className="text-muted-foreground truncate">{t(`ticket_${key}`)}</span>
                                    <span className="ml-auto font-mono font-semibold">{value}</span>
                                    <span className="text-muted-foreground w-9 shrink-0 text-right font-mono text-xs">
                                        {Math.round((value / total) * 100)}%
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="border-border/60 mt-5 border-t pt-4">
                    <VolumeChart it={it} />
                </div>
            </div>
        </Card>
    );
}

const CHART = { height: 96, minBar: 2, gutter: 22 };

/**
 * Rounds a scale's top up to a number the eye reads without doing arithmetic.
 *
 * 1 · 2 · 4 · 5 · 10 and their multiples of ten. The 4 is there to stop a peak of 23 from
 * being drawn against a scale of 50, which throws away half the chart's height and flattens
 * every bar in it.
 */
function niceCeil(value: number): number {
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const step = [1, 2, 4, 5, 10].find((s) => value <= s * magnitude) ?? 10;

    return step * magnitude;
}

/**
 * Two weeks of case flow: bars for what arrived each day, a line for what was still open at
 * the end of it.
 *
 * The two are not stacked, though the mockup drew them that way — arrivals are a flow and the
 * backlog is a level, so their sum means nothing and a case opened today would be counted in
 * both halves of its own bar. Bars and a line over one shared axis (both are ticket counts,
 * so this is not a second scale) let the card answer its two real questions at once: is work
 * coming in faster than usual, and is the pile growing or shrinking.
 */
function VolumeChart({ it }: { it: DashboardIt }) {
    const t = useT();
    const days = it.volume;
    if (days.length === 0) {
        return null;
    }

    // One scale for both series — the line would otherwise imply a magnitude the bars deny.
    // Rounded up to a readable top so the gridlines land on numbers somebody would say out
    // loud: a scale topping out at 17 gives ticks of 8.5 that mean nothing.
    const peak = niceCeil(Math.max(1, ...days.map((d) => Math.max(d.opened, d.backlog))));
    const y = (value: number) => CHART.height - (value / peak) * CHART.height;
    const step = 100 / days.length;
    // Mid-point of each day's slot, in percent — the line's vertices sit over their own bar.
    const x = (index: number) => step * index + step / 2;
    const linePoints = days.map((d, i) => `${x(i)},${y(d.backlog)}`).join(' ');
    const label = (iso: string) => iso.slice(5).replace('-', '/');
    // Top, middle, baseline — the middle only when halving lands on a whole ticket. A tick
    // reading "2.5" on a count of cases is a line nobody can measure anything against.
    const ticks = [peak, ...(peak % 2 === 0 ? [peak / 2] : []), 0];

    return (
        <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs font-semibold">{t('dash_volume').replace('{n}', String(it.volume_days))}</span>
                <span className="text-muted-foreground flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1.5">
                        <span className="bg-brand h-2 w-2 rounded-[2px]" />
                        {t('dash_volume_opened')}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-0.5 w-3 rounded-full bg-amber-500 dark:bg-amber-400" />
                        {t('dash_volume_backlog')}
                    </span>
                </span>
            </div>

            <div className="flex" style={{ height: CHART.height }}>
                {/* The scale, in its own gutter. Three ticks is enough to read a value off the
                    line to within a bar's height; more would be a table drawn as a chart. */}
                <div
                    className="text-muted-foreground relative shrink-0 font-mono text-[10px] leading-none"
                    style={{ width: CHART.gutter }}
                    aria-hidden="true"
                >
                    {ticks.map((tick) => (
                        <span key={tick} className="absolute right-1" style={{ top: y(tick), transform: 'translateY(-50%)' }}>
                            {tick}
                        </span>
                    ))}
                </div>

                <div className="relative flex-1">
                    {/* Recessive on purpose: a gridline is there to be measured against, not to
                        be looked at, so it sits behind the marks at border weight. */}
                    {ticks.map((tick) => (
                        <span
                            key={tick}
                            className={cn('bg-border absolute inset-x-0 h-px', tick === 0 && 'bg-border/80')}
                            style={{ top: y(tick) }}
                            aria-hidden="true"
                        />
                    ))}

                    {/* Bars in their own flex row so each keeps a real, hoverable width; the line
                        is one overlaid SVG stretched across the same box. */}
                    <div className="absolute inset-0 flex items-end gap-[3px]">
                        {days.map((d) => (
                            <div
                                key={d.date}
                                title={`${label(d.date)} · ${t('dash_volume_opened')} ${d.opened} · ${t('dash_volume_backlog')} ${d.backlog}`}
                                className="group flex h-full flex-1 items-end"
                            >
                                <div
                                    className="bg-brand/70 group-hover:bg-brand w-full rounded-t-[2px] transition-colors"
                                    style={{ height: Math.max(d.opened === 0 ? 0 : CHART.minBar, (d.opened / peak) * CHART.height) }}
                                />
                            </div>
                        ))}
                    </div>

                    <svg
                        viewBox={`0 0 100 ${CHART.height}`}
                        preserveAspectRatio="none"
                        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                        role="img"
                        aria-label={t('dash_volume_backlog')}
                    >
                        <polyline
                            points={linePoints}
                            fill="none"
                            vectorEffect="non-scaling-stroke"
                            strokeWidth="2"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            className="stroke-amber-500 dark:stroke-amber-400"
                        />
                    </svg>
                </div>
            </div>

            {/* One label per bar, in the same flex row the bars use — same gap, same flex-1,
                same gutter — so each date sits exactly under its own day rather than near it.
                Three spread-out dates left the reader counting bars to find a Tuesday.

                Day number only, except where the month turns (and on the first day), which is
                the one place the number alone would be ambiguous. */}
            <div className="text-muted-foreground mt-2 flex gap-[3px] font-mono text-[10px]" style={{ paddingLeft: CHART.gutter }}>
                {days.map((d, i) => {
                    const [, month, day] = d.date.split('-');
                    const turns = i === 0 || month !== days[i - 1].date.split('-')[1];

                    return (
                        <span key={d.date} className={cn('flex-1 text-center', turns && 'text-foreground font-semibold')}>
                            {turns ? `${Number(month)}/${Number(day)}` : Number(day)}
                        </span>
                    );
                })}
            </div>
        </>
    );
}

/**
 * Who is carrying the most, ranked — people only.
 *
 * The unassigned pile used to be a row here and it distorted the answer: it is always the
 * biggest bar, so the person actually carrying the most sat second with a half-length bar
 * measured against a queue nobody owns. It keeps its number in the header, where it stays
 * visible without competing in a ranking it is not part of.
 */
function WorkloadCard({ it }: { it: DashboardIt }) {
    const t = useT();
    const people = it.workload.filter((row) => row.assignee_id !== null);
    const unassigned = it.workload.find((row) => row.assignee_id === null)?.open ?? 0;
    const busiest = Math.max(1, ...people.map((row) => row.open));

    return (
        <Card className="overflow-hidden">
            <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
                <div className="flex items-center gap-2">
                    <Users className="text-muted-foreground h-4 w-4" />
                    <span className="font-semibold">{t('dash_team_workload')}</span>
                </div>
                <div className="flex items-center gap-3">
                    {/* Out of the ranking, still on the card: a queue nobody owns is not a
                        person's workload, but it is not something to stop reporting either. */}
                    {unassigned > 0 && (
                        <Link to="/tickets" className="text-muted-foreground hover:text-foreground text-xs">
                            {t('dash_unassigned')} <b className="text-foreground font-mono">{unassigned}</b>
                        </Link>
                    )}
                    <Link to="/tickets" className="text-muted-foreground hover:text-foreground text-xs font-medium">
                        {t('view_all')} →
                    </Link>
                </div>
            </div>
            {people.length === 0 ? (
                <div className="text-muted-foreground px-5 py-8 text-center text-sm">{t('dash_empty_workload')}</div>
            ) : (
                <ul className="space-y-3 p-5">
                    {people.map((row) => (
                        <li key={row.assignee_id}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="truncate">{row.name}</span>
                                <span className="text-muted-foreground shrink-0 text-xs">
                                    <b className="text-foreground font-mono">{row.open}</b> {t('dash_carrying')}
                                    {row.closed > 0 && (
                                        <>
                                            {' · '}
                                            <span className="font-mono">{row.closed}</span> {t('dash_closed')}
                                        </>
                                    )}
                                </span>
                            </div>
                            <div className="bg-secondary mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
                                <span className="bg-brand block h-full rounded-full" style={{ width: `${(row.open / busiest) * 100}%` }} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

/** A request's life in order — the list reads like the workflow, not biggest-first. */
const REQUEST_STATUS_ORDER = ['pending', 'approved', 'completed', 'rejected', 'cancelled'] as const;

const REQUEST_STATUS_DOT: Record<(typeof REQUEST_STATUS_ORDER)[number], string> = {
    pending: 'bg-amber-500 dark:bg-amber-400',
    approved: 'bg-blue-500 dark:bg-blue-400',
    completed: 'bg-emerald-500 dark:bg-emerald-400',
    rejected: 'bg-red-500 dark:bg-red-400',
    cancelled: 'bg-gray-400 dark:bg-gray-500',
};

/**
 * What came in over the window: split by status, then by what it was for.
 *
 * Bars rather than the tickets' ring — five statuses plus up to thirteen types is too many
 * slices to compare as angles, and one bar style for both halves keeps the card one shape.
 */
function RequestsOverviewCard({ requests }: { requests: DashboardRequests }) {
    const t = useT();
    const total = REQUEST_STATUS_ORDER.reduce((sum, key) => sum + requests.by_status[key], 0);
    const busiestType = Math.max(1, ...requests.by_type.map((row) => row.count));

    return (
        <Card className="overflow-hidden">
            <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
                <div className="flex items-center gap-2">
                    <Inbox className="text-muted-foreground h-4 w-4" />
                    <span className="font-semibold">{t('dash_requests_overview')}</span>
                </div>
                <span className="text-muted-foreground text-xs">
                    {t('dash_last_days').replace('{n}', String(requests.window_days))} ·{' '}
                    <b className="text-foreground font-mono font-semibold">{total}</b> {t('dash_requests')}
                </span>
            </div>
            <div className="p-5">
                {total === 0 ? (
                    <div className="text-muted-foreground py-12 text-center text-sm">{t('dash_empty_requests_window')}</div>
                ) : (
                    <>
                        <ul className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                            {REQUEST_STATUS_ORDER.map((key) => (
                                <li key={key} className="flex items-baseline gap-2 text-sm">
                                    <span className={cn('h-2 w-2 shrink-0 translate-y-[-1px] rounded-full', REQUEST_STATUS_DOT[key])} />
                                    <span className="text-muted-foreground truncate">{t(`req_status_${key}`)}</span>
                                    <span className="ml-auto font-mono font-semibold">{requests.by_status[key]}</span>
                                    <span className="text-muted-foreground w-9 shrink-0 text-right font-mono text-xs">
                                        {Math.round((requests.by_status[key] / total) * 100)}%
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <div className="border-border/60 mt-5 border-t pt-4">
                            <div className="text-muted-foreground mb-3 text-xs font-semibold">{t('dash_requests_by_type')}</div>
                            <ul className="space-y-3">
                                {requests.by_type.map((row) => (
                                    <li key={row.type}>
                                        <div className="flex items-baseline justify-between gap-3 text-sm">
                                            <span className="truncate">{t(`req_${row.type}`)}</span>
                                            <span className="font-mono font-semibold">{row.count}</span>
                                        </div>
                                        <div className="bg-secondary mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
                                            <span
                                                className="bg-brand block h-full rounded-full"
                                                style={{ width: `${(row.count / busiestType) * 100}%` }}
                                            />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </>
                )}
            </div>
        </Card>
    );
}

/**
 * Steps sitting with somebody past the reminder threshold, longest first — the same set the
 * morning bell goes out for. Each row opens the request itself.
 */
function WaitingRequestsCard({ requests }: { requests: DashboardRequests }) {
    const t = useT();
    return (
        <ListCard
            title={`${t('dash_waiting_title').replace('{n}', String(requests.waiting_after_days))}${requests.waiting_count > 0 ? ` · ${requests.waiting_count}` : ''}`}
            icon={Inbox}
            to="/requests?tab=all"
            empty={t('dash_empty_waiting')}
            rows={requests.waiting.length}
        >
            {requests.waiting.map((row: WaitingRequestRow) => (
                <Link key={row.id} to={`/requests?view=${row.id}`} className="hover:bg-accent/50 block transition-colors">
                    <Row
                        lead={row.title}
                        sub={
                            <>
                                <span className="font-mono">{row.reference}</span>
                                {row.waiting_on && (
                                    <span>
                                        {' '}
                                        · {t('dash_waiting_on')} {row.waiting_on}
                                    </span>
                                )}
                            </>
                        }
                        trailing={
                            <span className="shrink-0 font-mono text-xs font-semibold text-amber-600 dark:text-amber-400">
                                {t('dash_days').replace('{n}', String(row.days))}
                            </span>
                        }
                    />
                </Link>
            ))}
        </ListCard>
    );
}

/** Headcount, who just joined, and what IT still owes them. */
function HrSection({ hr }: { hr: DashboardHr }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const biggest = Math.max(1, ...hr.headcount_by_department.map((d) => d.count));

    return (
        <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label={t('dash_hr_headcount')} value={hr.kpi.headcount} icon={Users} to="/employees" />
                <StatCard label={t('dash_hr_new')} value={hr.kpi.new_this_month} icon={UserPlus} to="/employees" />
                <StatCard label={t('dash_hr_onboarding')} value={hr.kpi.pending_onboarding} icon={Inbox} to="/requests" />
                <StatCard label={t('dash_hr_resigned')} value={hr.kpi.resigned_this_month} icon={UserMinus} to="/employees" />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ListCard
                    title={t('dash_hr_recent_hires')}
                    icon={UserPlus}
                    to="/employees"
                    empty={t('dash_empty_hires')}
                    rows={hr.recent_hires.length}
                >
                    {hr.recent_hires.map((hire) => (
                        <Row
                            key={hire.id}
                            lead={hire.name}
                            sub={[hire.position, hire.department].filter(Boolean).join(' · ') || undefined}
                            trailing={<span className="text-muted-foreground font-mono text-xs">{hire.joined_at ?? '—'}</span>}
                        />
                    ))}
                </ListCard>

                <Card className="overflow-hidden">
                    <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                        <Building2 className="text-muted-foreground h-4 w-4" />
                        <span className="font-semibold">{t('dash_hr_by_department')}</span>
                    </div>
                    <ul className="space-y-3 p-5">
                        {hr.headcount_by_department.map((dept) => (
                            <li key={dept.id}>
                                <div className="flex items-baseline justify-between gap-3 text-sm">
                                    <span className="truncate">{(lang === 'th' ? dept.name_th : null) ?? dept.name}</span>
                                    <span className="font-mono font-semibold">{dept.count}</span>
                                </div>
                                <div className="bg-secondary mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
                                    <span className="bg-brand block h-full rounded-full" style={{ width: `${(dept.count / biggest) * 100}%` }} />
                                </div>
                            </li>
                        ))}
                    </ul>
                </Card>
            </div>
        </>
    );
}

/** The last few things anybody did, straight off the audit log. */
function ActivityCard({ rows }: { rows: ActivityRow[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (
        <ListCard title={t('dash_recent_activity')} icon={History} to="/permissions?tab=audit" empty={t('dash_empty_activity')} rows={rows.length}>
            {rows.map((row) => (
                <Row
                    key={row.id}
                    lead={
                        <>
                            {row.action}
                            {row.target && <span className="text-muted-foreground font-normal"> · {row.target}</span>}
                        </>
                    }
                    sub={row.actor ?? undefined}
                    trailing={<span className="text-muted-foreground shrink-0 text-xs">{relativeTime(row.at, lang, '')}</span>}
                />
            ))}
        </ListCard>
    );
}

function SkeletonCard() {
    return (
        <Card className="p-5">
            <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
            <div className="bg-muted mt-3 h-8 w-1/4 animate-pulse rounded" />
        </Card>
    );
}

export default function DashboardPage() {
    const t = useT();
    const { user, can } = useAuth();
    const lang = useUiStore((s) => s.lang);
    const { data: contracts } = useContractSummary();
    const { data, isLoading } = useDashboardSummary();

    const mine = data?.mine;
    const toAccept = mine?.pending_acceptance ?? [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">{lang === 'th' ? `สวัสดี, ${user?.name ?? ''}` : `Welcome back, ${user?.name ?? ''}`}</h1>
                <p className="text-muted-foreground text-sm">{t('dash_welcome_sub')}</p>
            </div>

            {/* The only block that asks for an action, so it sits above everything and is a
                list rather than a count: each row is a device nobody owns until it is accepted. */}
            {toAccept.length > 0 && (
                <Card className="border-brand/40 bg-brand/5 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <span className="bg-brand/15 text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                                <PackageCheck className="h-[18px] w-[18px]" />
                            </span>
                            <div>
                                <div className="font-semibold">{t('dash_accept_title')}</div>
                                <div className="text-muted-foreground text-sm">{t('dash_accept_sub')}</div>
                                <ul className="mt-2 space-y-1">
                                    {toAccept.map((asset) => (
                                        <li key={asset.id} className="text-sm">
                                            <span className="font-mono">{asset.asset_code}</span>
                                            {asset.model && <span className="text-muted-foreground"> · {asset.model}</span>}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                        <Button asChild>
                            <Link to="/my-assets-access">
                                <Check className="h-4 w-4" />
                                {t('dash_accept_go')}
                            </Link>
                        </Button>
                    </div>
                </Card>
            )}

            {/* The reader's own four numbers. Every one of them is a row count, not an estimate. */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {isLoading ? (
                    <>
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </>
                ) : (
                    <>
                        <StatCard label={t('dash_kpi_my_open')} value={mine?.kpi.open_tickets ?? 0} icon={Ticket} to="/tickets" />
                        <StatCard label={t('dash_kpi_my_requests')} value={mine?.kpi.pending_requests ?? 0} icon={Inbox} to="/requests" />
                        <StatCard label={t('dash_kpi_my_assets')} value={mine?.kpi.assets ?? 0} icon={Box} to="/my-assets-access" />
                        <StatCard label={t('dash_kpi_my_closed')} value={mine?.kpi.resolved_this_month ?? 0} icon={Check} to="/tickets" />
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ListCard title={t('dash_my_tickets')} icon={Ticket} to="/tickets" empty={t('dash_empty_tickets')} rows={mine?.tickets.length ?? 0}>
                    {mine?.tickets.map((tk: MyTicketRow) => (
                        <Row
                            key={tk.id}
                            lead={tk.subject}
                            sub={
                                <>
                                    <span className="font-mono">{tk.ticket_no}</span>
                                    {tk.assignee_name && <span> · {tk.assignee_name}</span>}
                                </>
                            }
                            status={tk.status}
                        />
                    ))}
                </ListCard>

                <ListCard
                    title={t('dash_my_requests')}
                    icon={Inbox}
                    to="/requests"
                    empty={t('dash_empty_requests')}
                    rows={mine?.requests.length ?? 0}
                >
                    {mine?.requests.map((rq: MyRequestRow) => (
                        <Row key={rq.id} lead={rq.title} sub={<span className="font-mono">{rq.reference}</span>} status={rq.status} />
                    ))}
                </ListCard>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ListCard
                    title={t('dash_my_assets')}
                    icon={Box}
                    to="/my-assets-access"
                    empty={t('dash_empty_assets')}
                    rows={mine?.assets.length ?? 0}
                >
                    {mine?.assets.map((asset: MyAssetRow) => (
                        <Row
                            key={asset.id}
                            lead={asset.model ?? asset.asset_code}
                            sub={
                                <>
                                    <span className="font-mono">{asset.asset_code}</span>
                                    {asset.category && <span> · {asset.category}</span>}
                                </>
                            }
                            status={asset.status}
                        />
                    ))}
                </ListCard>

                {/* Real, and the only org-wide figure on the page today. */}
                {can('contracts.module') && (
                    <Card className="hover:border-brand/40 p-5 transition-colors">
                        <Link to="/contracts" className="block">
                            <div className="flex items-start justify-between">
                                <div className="text-muted-foreground text-sm">{t('kpi_expiring_contracts')}</div>
                                <span className="bg-brand/10 text-brand flex h-9 w-9 items-center justify-center rounded-lg">
                                    <FileText className="h-[18px] w-[18px]" />
                                </span>
                            </div>
                            <div className={cn('mt-2 font-mono text-3xl font-bold', (contracts?.expiring ?? 0) > 0 && 'text-destructive')}>
                                {contracts?.expiring ?? '—'}
                            </div>
                            <div className="text-muted-foreground mt-1 text-xs">{lang === 'th' ? 'อยู่ในช่วงแจ้งเตือน' : 'in reminder window'}</div>
                        </Link>
                    </Card>
                )}
            </div>

            {/* Each block below is present only because the server sent it, and the server
                sends it only to a reader allowed to see it. The page never asks "what role is
                this?" — somebody who is both HR and IT gets both sections. */}
            {data?.it && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <TicketsOverviewCard it={data.it} />
                    <WorkloadCard it={data.it} />
                </div>
            )}

            {data?.requests && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <RequestsOverviewCard requests={data.requests} />
                    <WaitingRequestsCard requests={data.requests} />
                </div>
            )}

            {data?.hr && <HrSection hr={data.hr} />}

            {data?.activity && <ActivityCard rows={data.activity} />}
        </div>
    );
}
