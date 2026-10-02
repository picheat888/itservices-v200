/**
 * The "Ticket ค้างและเกิน SLA" page's own parts (pages/tickets-backlog.tsx), from the design
 * mockup: the SLA segments at the head of the filter bar (with how many tickets each holds),
 * the SLA due board — every live ticket in six lanes by the time left on the deadline it runs
 * against now, past-due on the left of a "ตอนนี้" line; a long lane folds and opens on its own —
 * then who holds them and the categories.
 *
 * All of it reads useBacklogBoard (every live ticket the other filters keep, unpaged); the SLA
 * filter narrows the board and cards here, while the table below is filtered on the server.
 * Hours left follow TicketBacklogReport: negative = past due; inside 24 h = due soon.
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { useBacklogBoard } from '../hooks/use-reports';
import type { BacklogBoardTicket, ChartSeries, TabularFilters } from '../types';
import { CARD_HEADING_TINT } from './card-heading';
import { FILL } from './chart-tones';
import { fold, StackBar } from './tabular-charts';
import { categoryKey, priorityKey } from './ticket-labels';

export type SlaState = 'breached' | 'due_soon' | 'on_track';

export function slaState(hoursLeft: number | null): SlaState {
    if (hoursLeft === null) return 'on_track';
    return hoursLeft < 0 ? 'breached' : hoursLeft <= 24 ? 'due_soon' : 'on_track';
}

/** The table's left stripe per row, from the row's own hours_left. */
export function backlogRowClass(row: Record<string, unknown>): string {
    const state = slaState(typeof row.hours_left === 'number' ? row.hours_left : null);
    return state === 'breached'
        ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-red-500)]'
        : state === 'due_soon'
          ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-amber-500)]'
          : '';
}

const PRIORITY_DOT: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-amber-500',
    medium: 'bg-blue-500',
    low: 'bg-emerald-500',
};
const NO_PRIORITY_DOT = 'bg-slate-400 dark:bg-slate-500';

const LANES: { key: string; label: string; test: (h: number | null) => boolean; tone: string; count: string }[] = [
    {
        key: 'over7',
        label: 'rep_bl_lane_over7',
        test: (h) => h !== null && h < -168,
        tone: 'border-red-500',
        count: 'text-red-600 dark:text-red-400',
    },
    {
        key: 'over1',
        label: 'rep_bl_lane_over1',
        test: (h) => h !== null && h >= -168 && h < -24,
        tone: 'border-red-500/60',
        count: 'text-red-600 dark:text-red-400',
    },
    {
        key: 'over0',
        label: 'rep_bl_lane_over0',
        test: (h) => h !== null && h >= -24 && h < 0,
        tone: 'border-red-500/35',
        count: 'text-red-600 dark:text-red-400',
    },
    {
        key: 'soon',
        label: 'rep_bl_lane_soon',
        test: (h) => h !== null && h >= 0 && h <= 24,
        tone: 'border-amber-500',
        count: 'text-amber-600 dark:text-amber-400',
    },
    { key: 'later', label: 'rep_bl_lane_later', test: (h) => h !== null && h > 24 && h <= 72, tone: 'border-border', count: '' },
    { key: 'far', label: 'rep_bl_lane_far', test: (h) => h === null || h > 72, tone: 'border-border', count: '' },
];

/** Cards per lane before "แสดงอีก n รายการ". */
const LANE_CARDS = 6;

const SEGMENTS: { value: SlaState | null; label: string }[] = [
    { value: null, label: 'rep_f_any' },
    { value: 'breached', label: 'rep_sla_breached' },
    { value: 'due_soon', label: 'rep_sla_due_soon' },
    { value: 'on_track', label: 'rep_sla_on_track' },
];

function Heading({ title, sub }: { title: React.ReactNode; sub?: React.ReactNode }) {
    return (
        <div className={cn(CARD_HEADING_TINT, 'border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3')}>
            <span className="text-sm font-semibold">{title}</span>
            {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
        </div>
    );
}

/** A legend entry: a small square in the bar's colour, then what it means. */
function Swatch({ tone, children }: { tone: string; children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <i className={cn('inline-block h-2.5 w-2.5 rounded-sm', tone)} />
            {children}
        </span>
    );
}

/** The tickets the board shows under the page's SLA filter. */
function narrowed(tickets: BacklogBoardTicket[], filters: TabularFilters) {
    const sla = filters.sla as SlaState | null | undefined;
    return sla ? tickets.filter((t) => slaState(t.hours_left) === sla) : tickets;
}

/** ทั้งหมด / เกิน SLA / ครบใน 24 ชม. / ยังมีเวลา — at the head of the filter bar, with counts. */
export function BacklogSlaSegments({ filters, patch }: { filters: TabularFilters; patch: (next: TabularFilters) => void }) {
    const t = useT();
    const { data: tickets = [] } = useBacklogBoard(filters);
    const count = (value: SlaState | null) => (value === null ? tickets.length : tickets.filter((x) => slaState(x.hours_left) === value).length);
    const active = (filters.sla as SlaState | null | undefined) ?? null;

    return (
        <div
            role="group"
            aria-label={t('rep_fl_sla')}
            className="border-border bg-card dark:bg-background inline-flex gap-0.5 rounded-md border p-0.5"
        >
            {SEGMENTS.map((s) => (
                <button
                    key={s.label}
                    type="button"
                    aria-pressed={active === s.value}
                    onClick={() => patch({ sla: s.value })}
                    className={cn(
                        'focus-visible:ring-brand/30 inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none',
                        active === s.value ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                    )}
                >
                    {t(s.label)}
                    <span className="font-mono opacity-80">{count(s.value)}</span>
                </button>
            ))}
        </div>
    );
}

function TicketCard({ ticket }: { ticket: BacklogBoardTicket }) {
    const t = useT();
    const canOpen = useCanOpen();
    const href = `/tickets?view=${ticket.id}`;
    const priority = ticket.priority ? t(priorityKey(ticket.priority)) : t('rep_prio_none');
    const body = (
        <>
            <i className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', (ticket.priority && PRIORITY_DOT[ticket.priority]) || NO_PRIORITY_DOT)} />
            <span className="min-w-0">
                <span className="text-muted-foreground block font-mono text-xs">{ticket.ticket_no}</span>
                <span className="block truncate text-xs font-semibold">{ticket.subject}</span>
                <span
                    className={cn(
                        'block truncate text-xs',
                        ticket.assignee ? 'text-muted-foreground' : 'font-semibold text-amber-600 dark:text-amber-400',
                    )}
                >
                    {ticket.assignee ?? t('rep_opt_unassigned')}
                </span>
            </span>
        </>
    );
    const className = 'border-border bg-card flex gap-2 rounded-lg border px-2.5 py-2 text-left';

    return canOpen(href) ? (
        <Link
            to={href}
            title={`${ticket.subject} · ${priority}`}
            className={cn(className, 'hover:border-brand/50 hover:bg-accent transition-colors')}
        >
            {body}
        </Link>
    ) : (
        <div title={`${ticket.subject} · ${priority}`} className={className}>
            {body}
        </div>
    );
}

function DueBoard({ tickets }: { tickets: BacklogBoardTicket[] }) {
    const t = useT();
    // Lanes opened past LANE_CARDS — each lane folds and opens on its own.
    const [openLanes, setOpenLanes] = useState<string[]>([]);
    const toggleLane = (key: string) => setOpenLanes((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));
    const legend: [string, string][] = [
        ['critical', PRIORITY_DOT.critical],
        ['high', PRIORITY_DOT.high],
        ['medium', PRIORITY_DOT.medium],
        ['low', PRIORITY_DOT.low],
    ];

    return (
        <Card className="overflow-hidden">
            <Heading
                title={
                    <>
                        {t('rep_bl_board_title')}
                        <span className="text-muted-foreground ml-2 text-xs font-normal">{t('rep_bl_board_sub')}</span>
                    </>
                }
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {legend.map(([key, dot]) => (
                            <span key={key} className="inline-flex items-center gap-1.5">
                                <i className={cn('inline-block h-2 w-2 rounded-full', dot)} />
                                {t(priorityKey(key))}
                            </span>
                        ))}
                        <span className="inline-flex items-center gap-1.5">
                            <i className={cn('inline-block h-2 w-2 rounded-full', NO_PRIORITY_DOT)} />
                            {t('rep_prio_none')}
                        </span>
                    </span>
                }
            />
            {/* Six lanes stay side by side; a narrow screen scrolls them rather than stacking. */}
            <div className="overflow-x-auto">
                <div className="grid min-w-[52rem] grid-cols-[repeat(3,minmax(0,1fr))_0_repeat(3,minmax(0,1fr))] gap-x-2.5 px-5 pt-2 pb-5">
                    {LANES.map((lane, i) => {
                        const items = tickets.filter((ticket) => lane.test(ticket.hours_left));
                        const open = openLanes.includes(lane.key);
                        const folding = fold(items, LANE_CARDS, open);
                        return (
                            <div key={lane.key} className="contents">
                                {i === 3 && (
                                    <div className="border-foreground/50 relative mt-1 border-l-2 border-dashed" aria-hidden>
                                        <span className="bg-foreground text-background absolute -top-1 left-1/2 -translate-x-1/2 rounded-full px-2 py-px text-xs font-bold whitespace-nowrap">
                                            {t('rep_bl_now')}
                                        </span>
                                    </div>
                                )}
                                <div className="flex min-w-0 flex-col gap-2 pt-3">
                                    <div className={cn('flex items-baseline justify-between gap-1.5 border-b-2 pb-1.5', lane.tone)}>
                                        <span className="text-muted-foreground text-xs font-semibold">{t(lane.label)}</span>
                                        <b className={cn('font-mono text-lg', lane.count)}>{items.length}</b>
                                    </div>
                                    {items.length === 0 ? (
                                        <span className="text-muted-foreground py-2 text-xs">{t('rep_bl_none')}</span>
                                    ) : (
                                        folding.shown.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)
                                    )}
                                    {folding.folds && (
                                        <button
                                            type="button"
                                            onClick={() => toggleLane(lane.key)}
                                            aria-expanded={open}
                                            className="border-border text-muted-foreground hover:border-brand/50 hover:bg-accent hover:text-foreground focus-visible:ring-brand/30 flex items-center justify-center gap-1 rounded-lg border border-dashed py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                                        >
                                            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                            {open ? t('rep_chart_show_less') : t('rep_bl_more').replace('{n}', String(folding.rest.length))}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
}

function Owners({ tickets }: { tickets: BacklogBoardTicket[] }) {
    const t = useT();
    const by = new Map<string, { breached: number; due_soon: number; on_track: number; n: number }>();
    for (const ticket of tickets) {
        const key = ticket.assignee ?? '';
        const row = by.get(key) ?? { breached: 0, due_soon: 0, on_track: 0, n: 0 };
        row[slaState(ticket.hours_left)]++;
        row.n++;
        by.set(key, row);
    }
    const max = Math.max(1, ...[...by.values()].map((r) => r.n));
    const named = [...by.entries()].filter(([name]) => name !== '').sort(([, a], [, b]) => b.breached - a.breached || b.n - a.n);
    const unassigned = by.get('');
    const width = (v: number) => `${(v / max) * 100}%`;

    const row = (name: string, r: { breached: number; due_soon: number; on_track: number; n: number }, apart = false) => (
        <div
            key={name || 'none'}
            className={cn(
                'border-border/60 grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2.5rem] items-center gap-3 border-b px-5 py-2.5 text-sm last:border-b-0',
                apart && 'border-border border-t-2 border-dashed',
            )}
        >
            <span className="min-w-0">
                <span className={cn('block truncate', apart && 'font-semibold text-amber-600 dark:text-amber-400')}>
                    {name || t('rep_opt_unassigned')}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                    {/* The total first, then how many of them are past SLA. */}
                    {t('rep_bl_owner_count').replace('{n}', String(r.n))}
                    {r.breached > 0 && ` · ${t('rep_bl_owner_over').replace('{n}', String(r.breached))}`}
                </span>
            </span>
            <span className="bg-muted flex h-2.5 overflow-hidden rounded-full">
                <span className="block h-full bg-red-500" style={{ width: width(r.breached) }} />
                <span className="block h-full bg-amber-500" style={{ width: width(r.due_soon) }} />
                <span className="bg-brand/70 block h-full" style={{ width: width(r.on_track) }} />
            </span>
            <span className="text-right font-mono font-semibold">{r.n}</span>
        </div>
    );

    return (
        <Card className="overflow-hidden">
            <Heading
                title={t('rep_bl_owners_title')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Swatch tone="bg-red-500">{t('rep_sla_breached')}</Swatch>
                        <Swatch tone="bg-amber-500">{t('rep_sla_due_soon')}</Swatch>
                        <Swatch tone="bg-brand/70">{t('rep_sla_on_track')}</Swatch>
                    </span>
                }
            />
            {tickets.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-sm">{t('rep_bl_empty')}</div>
            ) : (
                <div>
                    {named.map(([name, r]) => row(name, r))}
                    {/* The queue nobody has taken yet sits apart — it needs handing out, not chasing. */}
                    {unassigned && row('', unassigned, true)}
                </div>
            )}
        </Card>
    );
}

/** The category card's two parts — past SLA, and the rest — in the report palette. */
const CATEGORY_SERIES: ChartSeries[] = [
    { key: 'breached', label_key: 'rep_sla_breached', tone: 'red' },
    { key: 'not_breached', label_key: 'rep_sla_not_breached', tone: 'blue' },
];

function Categories({ tickets }: { tickets: BacklogBoardTicket[] }) {
    const t = useT();
    const by = new Map<string, { n: number; breached: number }>();
    for (const ticket of tickets) {
        const key = ticket.category ?? 'other';
        const row = by.get(key) ?? { n: 0, breached: 0 };
        row.n++;
        if (slaState(ticket.hours_left) === 'breached') row.breached++;
        by.set(key, row);
    }
    const rows = [...by.entries()].sort(([, a], [, b]) => b.n - a.n);
    const max = Math.max(1, ...rows.map(([, r]) => r.n));

    return (
        <Card className="overflow-hidden">
            <Heading
                title={t('rep_bl_cats_title')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Swatch tone={FILL.red}>{t('rep_sla_breached')}</Swatch>
                        <Swatch tone={FILL.blue}>{t('rep_sla_not_breached')}</Swatch>
                    </span>
                }
            />
            {rows.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-sm">{t('rep_bl_empty')}</div>
            ) : (
                <div className="space-y-2.5 px-5 py-4">
                    {/* Names the right-hand count, as the staff card's "ทั้งหมด" column. */}
                    <div className="text-muted-foreground grid grid-cols-[92px_minmax(0,1fr)_40px] gap-2.5 text-xs">
                        <span className="col-start-3 text-right">{t('rep_col_total')}</span>
                    </div>
                    {rows.map(([category, r]) => (
                        <div key={category} className="grid grid-cols-[92px_minmax(0,1fr)_40px] items-center gap-2.5 text-sm">
                            <span className="truncate">{t(categoryKey(category))}</span>
                            {/* Past SLA in red, the rest in blue, each count over its part (as the staff card),
                                the bar's length against the largest category. */}
                            <StackBar values={{ breached: r.breached, not_breached: r.n - r.breached }} series={CATEGORY_SERIES} scale={max} />
                            <span className="text-right font-mono text-xs font-bold">{r.n}</span>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

/** The board and its two cards, between the summary tiles and the table. */
export function BacklogBoardCards({ filters }: { filters: TabularFilters }) {
    const { data, isLoading } = useBacklogBoard(filters);

    if (isLoading || !data) {
        return (
            <Card className="space-y-3 p-5" aria-hidden>
                <Skeleton className="h-4 w-48" />
                <div className="grid grid-cols-6 gap-3">
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} className="h-40" />
                    ))}
                </div>
            </Card>
        );
    }
    const tickets = narrowed(data, filters);

    return (
        <div className="space-y-4">
            <DueBoard tickets={tickets} />
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
                <Owners tickets={tickets} />
                <Categories tickets={tickets} />
            </div>
        </div>
    );
}
