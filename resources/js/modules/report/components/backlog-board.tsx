/**
 * The "Ticket ค้าง และเกิน SLA" page's own parts (pages/tickets-backlog.tsx), from the design
 * mockup: the SLA segments at the head of the filter bar (with how many tickets each holds),
 * the SLA due board — every live ticket in six lanes by the time left on the deadline it runs
 * against now, past-due on the left of a "ตอนนี้" line; a long lane folds and opens on its own —
 * then who holds them and the categories — a press on an owner or a category filters the page.
 *
 * All of it reads useBacklogBoard (every live ticket the other filters keep, unpaged); the SLA
 * filter narrows the board and cards here, while the table below is filtered on the server.
 * Hours left follow TicketBacklogReport: negative = past due; inside 24 h = due soon.
 */
import { useT } from '@/lang';
import { toneDots } from '@/shared/components/status-badge';
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
import { fold, FoldToggle, StackBar } from './chart-parts';
import { FILL } from './chart-tones';
import { TICKET_PRIORITY_TONE } from './ticket-badges';
import { categoryKey, priorityKey } from './ticket-labels';

export type SlaState = 'over_sla' | 'due_soon' | 'on_track';

export function slaState(hoursLeft: number | null): SlaState {
    if (hoursLeft === null) return 'on_track';
    return hoursLeft < 0 ? 'over_sla' : hoursLeft <= 24 ? 'due_soon' : 'on_track';
}

/** The table's left stripe per row, from the row's own hours_left. */
export function backlogRowClass(row: Record<string, unknown>): string {
    const state = slaState(typeof row.hours_left === 'number' ? row.hours_left : null);
    return state === 'over_sla'
        ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-red-400)]'
        : state === 'due_soon'
          ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-amber-400)]'
          : '';
}

/** Priority dots in the very hues of the table's priority pills (ticket-badges.tsx), low = grey. */
const PRIORITY_DOT: Record<string, string> = Object.fromEntries(
    Object.entries(TICKET_PRIORITY_TONE).map(([priority, tone]) => [priority, toneDots[tone]]),
);
/** No priority yet: a hollow ring, so it never reads as the grey "low". */
const NO_PRIORITY_DOT = 'border-muted-foreground border bg-transparent';

const LANES: { key: string; label: string; test: (h: number | null) => boolean; tone: string; count: string }[] = [
    {
        key: 'over7',
        label: 'rep_bl_lane_over7',
        test: (h) => h !== null && h < -168,
        tone: 'border-red-400',
        count: 'text-red-600 dark:text-red-400',
    },
    {
        key: 'over1',
        label: 'rep_bl_lane_over1',
        test: (h) => h !== null && h >= -168 && h < -24,
        tone: 'border-red-400/60',
        count: 'text-red-600 dark:text-red-400',
    },
    {
        key: 'over0',
        label: 'rep_bl_lane_over0',
        test: (h) => h !== null && h >= -24 && h < 0,
        tone: 'border-red-400/35',
        count: 'text-red-600 dark:text-red-400',
    },
    {
        key: 'soon',
        label: 'rep_bl_lane_soon',
        test: (h) => h !== null && h >= 0 && h <= 24,
        tone: 'border-amber-400',
        count: 'text-amber-700 dark:text-amber-400',
    },
    { key: 'later', label: 'rep_bl_lane_later', test: (h) => h !== null && h > 24 && h <= 72, tone: 'border-border', count: '' },
    { key: 'far', label: 'rep_bl_lane_far', test: (h) => h === null || h > 72, tone: 'border-border', count: '' },
];

/** Cards per lane before "แสดงอีก n รายการ". */
const LANE_CARDS = 6;

const SEGMENTS: { value: SlaState | null; label: string }[] = [
    { value: null, label: 'rep_f_any' },
    { value: 'over_sla', label: 'rep_sla_over_sla' },
    { value: 'due_soon', label: 'rep_sla_due_soon' },
    { value: 'on_track', label: 'rep_sla_on_track' },
];

export function Heading({ title, sub }: { title: React.ReactNode; sub?: React.ReactNode }) {
    return (
        <div className={cn(CARD_HEADING_TINT, 'border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3')}>
            <span className="text-sm font-semibold">{title}</span>
            {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
        </div>
    );
}

/** A legend entry: a small square in the bar's colour, then what it means. */
export function Swatch({ tone, children }: { tone: string; children: React.ReactNode }) {
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
                        ticket.assignee ? 'text-muted-foreground' : 'font-semibold text-amber-700 dark:text-amber-400',
                    )}
                >
                    {ticket.assignee ?? t('rep_opt_unassigned')}
                </span>
            </span>
        </>
    );
    const className = 'border-border bg-card flex gap-2 rounded-lg border px-2.5 py-2 text-left';

    return canOpen(href) ? (
        <Link to={href} title={`${ticket.subject}\n${priority}`} className={cn(className, 'hover:border-brand/50 hover:bg-accent transition-colors')}>
            {body}
        </Link>
    ) : (
        <div title={`${ticket.subject}\n${priority}`} className={className}>
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
                <div className="grid min-w-[52rem] grid-cols-[repeat(3,minmax(0,1fr))_0_repeat(3,minmax(0,1fr))] gap-x-2.5 px-5 pt-3 pb-5">
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
                                {/* pt-7 keeps the lane headings clear of the "ตอนนี้" pill riding the top of the line. */}
                                <div className="flex min-w-0 flex-col gap-2 pt-7">
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

/** The owner card's three parts by SLA state, in the report palette — the board's lanes in short. */
const OWNER_SERIES: ChartSeries[] = [
    { key: 'over_sla', label_key: 'rep_sla_over_sla', tone: 'soft-red' },
    { key: 'due_soon', label_key: 'rep_sla_due_soon', tone: 'soft-amber' },
    { key: 'on_track', label_key: 'rep_sla_on_track', tone: 'soft-blue' },
];

/**
 * Owners shown before the card folds — the ones with most past SLA, as the list is sorted. With
 * 30 staff the card would otherwise run far past the category card beside it. The unassigned
 * queue always shows.
 */
const OWNER_ROWS = 5;

/** Name / bar / total — shared by the header row and every owner row so the columns line up. */
const OWNER_GRID = 'grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2.5rem] gap-3';
const CATEGORY_GRID = 'grid grid-cols-[92px_minmax(0,1fr)_40px] gap-2.5';

/**
 * One row of the owner or category card, as a button: it sets the page's filter to this row
 * (the board and the table follow), and a second press clears it. Both cards share its rhythm
 * — the same height, no dividers — so they read as one pair. The title gives the full name
 * (a long Thai name is cut in its column) and says what a press does.
 */
function FilterRow({
    grid,
    label,
    selected,
    onSelect,
    className,
    children,
}: {
    grid: string;
    label: string;
    selected: boolean;
    onSelect: () => void;
    className?: string;
    children: React.ReactNode;
}) {
    const t = useT();

    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onSelect}
            title={`${label}\n${t(selected ? 'rep_bl_filter_clear' : 'rep_bl_filter_hint')}`}
            className={cn(
                grid,
                'focus-visible:ring-brand/30 w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
                selected ? 'bg-brand/10 ring-brand/40 ring-1' : 'hover:bg-accent',
                className,
            )}
        >
            {children}
        </button>
    );
}

function Owners({ tickets, filters, patch }: { tickets: BacklogBoardTicket[]; filters: TabularFilters; patch: (next: TabularFilters) => void }) {
    const t = useT();
    // Keyed by the assignee's id, the value the page's assignee filter takes ('' = nobody yet).
    const by = new Map<string, { name: string; over_sla: number; due_soon: number; on_track: number; n: number }>();
    for (const ticket of tickets) {
        const key = ticket.assignee_id === null ? '' : String(ticket.assignee_id);
        const row = by.get(key) ?? { name: ticket.assignee ?? '', over_sla: 0, due_soon: 0, on_track: 0, n: 0 };
        row[slaState(ticket.hours_left)]++;
        row.n++;
        by.set(key, row);
    }
    const max = Math.max(1, ...[...by.values()].map((r) => r.n));
    // Most past SLA, then most open; a tie goes by name, so the order never shuffles on a refresh.
    const named = [...by.entries()]
        .filter(([id]) => id !== '')
        .sort(([, a], [, b]) => b.over_sla - a.over_sla || b.n - a.n || a.name.localeCompare(b.name));
    const unassigned = by.get('');
    const [open, setOpen] = useState(false);
    const folding = fold(named, OWNER_ROWS, open);
    const active = filters.assignee === null || filters.assignee === undefined ? null : String(filters.assignee);

    const row = (id: string, r: { name: string; over_sla: number; due_soon: number; on_track: number; n: number }, apart = false) => {
        // The filter's own values: the user id, or "none" for the unassigned queue.
        const value = apart ? 'none' : id;
        const label = r.name || t('rep_opt_unassigned');
        const selected = active === value;
        return (
            <FilterRow
                key={value}
                grid={OWNER_GRID}
                label={label}
                selected={selected}
                onSelect={() => patch({ assignee: selected ? null : apart ? 'none' : Number(id) })}
            >
                <span className={cn('min-w-0 truncate', apart && 'font-semibold text-amber-700 dark:text-amber-400')}>{label}</span>
                {/* Each part's count over it, as "ค้างตามหมวด"; the length against whoever holds the most. */}
                <StackBar values={{ over_sla: r.over_sla, due_soon: r.due_soon, on_track: r.on_track }} series={OWNER_SERIES} scale={max} />
                <span className="text-right font-mono font-semibold">{r.n}</span>
            </FilterRow>
        );
    };

    return (
        <Card className="flex flex-col overflow-hidden">
            <Heading
                title={t('rep_bl_owners_title')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Swatch tone={FILL['soft-red']}>{t('rep_sla_over_sla')}</Swatch>
                        <Swatch tone={FILL['soft-amber']}>{t('rep_sla_due_soon')}</Swatch>
                        <Swatch tone={FILL['soft-blue']}>{t('rep_sla_on_track')}</Swatch>
                    </span>
                }
            />
            {tickets.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-sm">{t('rep_bl_empty')}</div>
            ) : (
                <div className="space-y-0.5 px-3 py-2">
                    {/* Names the right-hand count, as in "ค้างตามหมวด". */}
                    <div className={cn(OWNER_GRID, 'text-muted-foreground px-2 pt-1 text-xs')}>
                        <span className="col-start-3 text-right">{t('rep_col_total')}</span>
                    </div>
                    {folding.shown.map(([id, r]) => row(id, r))}
                    {/* The queue nobody has taken yet sits apart, under the card's only rule — it needs handing out, not chasing. */}
                    {/* The rule only divides — with no owner above (filtered to the queue) it is left out. */}
                    {unassigned && (
                        <div className={cn(folding.shown.length > 0 && 'border-border mt-1.5 border-t-2 border-dashed pt-1.5')}>
                            {row('', unassigned, true)}
                        </div>
                    )}
                </div>
            )}
            {folding.folds && <FoldToggle open={open} total={named.length} onToggle={() => setOpen((o) => !o)} />}
        </Card>
    );
}

/** The category card's two parts — past SLA, and the rest — in the report palette. */
const CATEGORY_SERIES: ChartSeries[] = [
    { key: 'over_sla', label_key: 'rep_sla_over_sla', tone: 'soft-red' },
    { key: 'not_over_sla', label_key: 'rep_sla_not_over_sla', tone: 'soft-blue' },
];

function Categories({ tickets, filters, patch }: { tickets: BacklogBoardTicket[]; filters: TabularFilters; patch: (next: TabularFilters) => void }) {
    const t = useT();
    const by = new Map<string, { n: number; over_sla: number }>();
    for (const ticket of tickets) {
        const key = ticket.category ?? 'other';
        const row = by.get(key) ?? { n: 0, over_sla: 0 };
        row.n++;
        if (slaState(ticket.hours_left) === 'over_sla') row.over_sla++;
        by.set(key, row);
    }
    // Most past SLA first, then the most open (as "ค้างอยู่กับใคร"); the catch-all "อื่น ๆ" always last;
    // a tie goes by the category's key, so the order never shuffles on a refresh.
    const rows = [...by.entries()].sort(
        ([ka, a], [kb, b]) => Number(ka === 'other') - Number(kb === 'other') || b.over_sla - a.over_sla || b.n - a.n || ka.localeCompare(kb),
    );
    const max = Math.max(1, ...rows.map(([, r]) => r.n));
    const active = filters.category ?? null;

    return (
        <Card className="overflow-hidden">
            <Heading
                title={t('rep_bl_cats_title')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Swatch tone={FILL['soft-red']}>{t('rep_sla_over_sla')}</Swatch>
                        <Swatch tone={FILL['soft-blue']}>{t('rep_sla_not_over_sla')}</Swatch>
                    </span>
                }
            />
            {rows.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-sm">{t('rep_bl_empty')}</div>
            ) : (
                <div className="space-y-0.5 px-3 py-2">
                    {/* Names the right-hand count, as the staff card's "ทั้งหมด" column. */}
                    <div className={cn(CATEGORY_GRID, 'text-muted-foreground px-2 pt-1 text-xs')}>
                        <span className="col-start-3 text-right">{t('rep_col_total')}</span>
                    </div>
                    {rows.map(([category, r]) => {
                        const label = t(categoryKey(category));
                        const selected = active === category;
                        return (
                            <FilterRow
                                key={category}
                                grid={CATEGORY_GRID}
                                label={label}
                                selected={selected}
                                onSelect={() => patch({ category: selected ? null : category })}
                            >
                                <span className="truncate">{label}</span>
                                {/* Past SLA in red, the rest in blue, each count over its part (as the staff card),
                                    the bar's length against the largest category. */}
                                <StackBar values={{ over_sla: r.over_sla, not_over_sla: r.n - r.over_sla }} series={CATEGORY_SERIES} scale={max} />
                                {/* Same size and weight as the totals of "ค้างอยู่กับใคร" beside it. */}
                                <span className="text-right font-mono font-semibold">{r.n}</span>
                            </FilterRow>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}

/** The board and its two cards, between the summary tiles and the table; a card row press filters the page. */
export function BacklogBoardCards({ filters, patch }: { filters: TabularFilters; patch: (next: TabularFilters) => void }) {
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
                <Owners tickets={tickets} filters={filters} patch={patch} />
                <Categories tickets={tickets} filters={filters} patch={patch} />
            </div>
        </div>
    );
}
