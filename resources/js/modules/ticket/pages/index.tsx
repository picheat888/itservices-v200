import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { Column, DataTable } from '@/shared/components/data-table';
import { FilterPopover } from '@/shared/components/filter-popover';
import { PageTabs } from '@/shared/components/page-tabs';
import { RecordMissingDialog } from '@/shared/components/record-missing';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { ToneDot } from '@/shared/components/status-badge';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useTabParam } from '@/shared/hooks/use-tab-param';
import { formatDateTime as fmtDateTime, formatRangeShort } from '@/shared/lib/datetime';
import { cn, toRecordId } from '@/shared/lib/utils';
import type { Ticket, TicketPriority, TicketStatus } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { DateRangeInput } from '@/shared/ui/date-range-input';
import { Input } from '@/shared/ui/input';
import { useUiStore } from '@/stores/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, ChevronRight, CircleDot, Flag, Gauge, History, LayoutGrid, Plus, Search, Tag, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ticketApi, type SummaryRange } from '../api/ticketApi';
import { AssignTicketModal } from '../components/assign-ticket-modal';
import { CreateTicketDrawer } from '../components/create-ticket-drawer';
import { EditTicketDrawer } from '../components/edit-ticket-drawer';
import { ForwardTicketModal } from '../components/forward-ticket-modal';
import { ResolveTicketModal, type ResolveMode } from '../components/resolve-ticket-modal';
import { TakeCaseModal } from '../components/take-case-modal';
import { TicketDetailDrawer } from '../components/ticket-detail-drawer';
import {
    TICKET_CATEGORIES,
    TICKET_PRIORITY_META,
    TICKET_STATUS_META,
    TicketCategoryIcon,
    TicketPriorityBadge,
    TicketSlaBadge,
    TicketStatusBadge,
    TicketSubject,
} from '../components/ticket-meta';
import { TicketOverviewTiles } from '../components/ticket-overview-tiles';
import { TicketUpdateModal } from '../components/ticket-update-modal';
import { useTickets, useTicketSummary } from '../hooks/use-tickets';

// The page's tabs. The active tab is mirrored in the URL (?tab=) so a reload / shared link stays put.
const TAB_IDS = ['overview', 'all', 'mine', 'my'] as const;
type Tab = (typeof TAB_IDS)[number];
const ALL = '__all__';

// Server-side sort orders for the list tabs; the first is the backend default.
const DEFAULT_SORT = 'created_desc';
const SORT_OPTIONS = ['created_desc', 'created_asc', 'updated_desc', 'priority_desc', 'sla_due'] as const;
const SORT_LABEL: Record<(typeof SORT_OPTIONS)[number], string> = {
    created_desc: 'ticket_sort_newest',
    created_asc: 'ticket_sort_oldest',
    updated_desc: 'ticket_sort_updated',
    priority_desc: 'ticket_sort_priority',
    sla_due: 'ticket_sort_sla',
};

const isTicketTab = (v: string | null): v is Tab => (TAB_IDS as readonly string[]).includes(v ?? '');

// URL keys of the list tabs, cleared on a tab switch (?per stays).
const LIST_KEYS = ['search', 'status', 'category', 'priority', 'sla', 'sort', 'page'];
const TICKET_STATUSES = Object.keys(TICKET_STATUS_META) as TicketStatus[];
const TICKET_PRIORITIES = Object.keys(TICKET_PRIORITY_META) as TicketPriority[];
const DEFAULT_RANGE = 30;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A URL value when it is one of `allowed`, else '' (all). */
const pickAllowed = <T extends string>(value: string, allowed: readonly T[]): T | '' =>
    (allowed as readonly string[]).includes(value) ? (value as T) : '';

/** The dashboard window from ?range (7 / 90, or custom with ?from & ?to); anything else is 30 days. */
function readRange(range: string, from: string, to: string): SummaryRange {
    if (range === 'custom') {
        return ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to ? { from, to } : DEFAULT_RANGE;
    }
    const days = Number(range);
    return days === 7 || days === 90 ? days : DEFAULT_RANGE;
}

/**
 * 7 / 30 / 90-day window selector for the dashboard, plus a custom from–to range. "กำหนดเอง"
 * opens the shared two-month range calendar (as the reports do), which applies only on
 * "นำไปใช้" — so a half-picked range never fetches — and can't pick an end before the start.
 */
function RangeSelect({ value, onChange, t }: { value: SummaryRange; onChange: (v: SummaryRange) => void; t: (k: string) => string }) {
    const lang = useUiStore((s) => s.lang);
    const custom = typeof value === 'object';

    return (
        <div className="border-border inline-flex rounded-lg border p-0.5">
            {[7, 30, 90].map((d) => (
                <button
                    key={d}
                    onClick={() => onChange(d)}
                    className={cn(
                        'rounded-md px-3 py-1 text-xs font-medium transition-colors [@media(pointer:coarse)]:py-2',
                        value === d ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {d} {t('ticket_days')}
                </button>
            ))}
            <DateRangeInput from={custom ? value.from : ''} to={custom ? value.to : ''} align="end" onChange={(from, to) => onChange({ from, to })}>
                <button
                    type="button"
                    className={cn(
                        'rounded-md px-3 py-1 text-xs font-medium transition-colors [@media(pointer:coarse)]:py-2',
                        custom ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {custom ? formatRangeShort(value.from, value.to, lang) : t('ticket_range_custom')}
                </button>
            </DateRangeInput>
        </div>
    );
}

/** Loading placeholder for the dashboard body (four tiles, then category bars beside the latest list). */
function TicketOverviewBodySkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="space-y-3 p-5">
                        <div className="flex items-center justify-between">
                            <div className="bg-muted h-4 w-20 animate-pulse rounded" />
                            <div className="bg-muted h-4 w-14 animate-pulse rounded-full" />
                        </div>
                        <div className="bg-muted h-8 w-16 animate-pulse rounded" />
                        <div className="bg-muted h-3 w-28 animate-pulse rounded" />
                        <div className="bg-muted h-3 w-20 animate-pulse rounded" />
                    </Card>
                ))}
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                <Card className="overflow-hidden xl:col-span-2">
                    <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                        <div className="bg-muted h-4 w-4 animate-pulse rounded" />
                        <div className="bg-muted h-4 w-36 animate-pulse rounded" />
                    </div>
                    <div className="space-y-4 p-5">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="bg-muted h-4 w-28 shrink-0 animate-pulse rounded" />
                                <div className="bg-muted h-2 flex-1 animate-pulse rounded-full" />
                                <div className="bg-muted h-4 w-10 shrink-0 animate-pulse rounded" />
                            </div>
                        ))}
                    </div>
                </Card>
                <Card className="overflow-hidden xl:col-span-3">
                    <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                        <div className="bg-muted h-4 w-4 animate-pulse rounded" />
                        <div className="bg-muted h-4 w-24 animate-pulse rounded" />
                    </div>
                    <div className="space-y-2 p-5">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="bg-muted h-8 w-full animate-pulse rounded" />
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}

export default function TicketsPage() {
    const t = useT();
    // System-timezone formatter (Settings -> Company) — the API emits UTC timestamps.
    const { user, can: has } = useAuth();
    const isIT = has('tickets.view_all');
    const canCreate = has('tickets.create');
    const canOverview = has('tickets.view_dashboard');
    const canJobs = has('tickets.jobs');
    // My Tickets (requester view) has its own gate so it can be granted per role.
    const canMyTickets = has('tickets.my');
    // Take Case mirrors the backend gates: tickets.resolve + the matching Ticket Level.
    const canTake = has('tickets.resolve');
    const hasLevel = (category: string) => has(`tickets.level_${category}`);
    // Assign / Forward mirror their backend gates.
    const canAssign = has('tickets.assign');
    const canForward = has('tickets.forward');
    // Classify (kind of work) mirrors its backend gate — the drawer adds the assignee + in-progress checks.
    const canSetWorkClass = has('tickets.set_work_class');

    // Tabs the current user can see, in display order — each behind its own gate.
    const visibleTabs: Tab[] = [
        ...(canOverview ? (['overview'] as Tab[]) : []),
        ...(isIT ? (['all'] as Tab[]) : []),
        ...(canJobs ? (['mine'] as Tab[]) : []),
        ...(canMyTickets ? (['my'] as Tab[]) : []),
    ];

    const [searchParams, setSearchParams] = useSearchParams();
    // The tab lives in ?tab= (useTabParam): reloads / shared links are exact, Back steps through tabs.
    // Only a tab this reader can see counts; otherwise the first visible one (a role with no
    // ticket tabs at all still lands somewhere harmless).
    const isVisibleTab = (v: string | null): v is Tab => isTicketTab(v) && visibleTabs.includes(v);
    const [tab, setTab] = useTabParam(isVisibleTab, visibleTabs[0] ?? 'my');

    // List search, filters, sort and page live in the URL (?search, status, category, priority, sla, sort, page, per).
    const list = useListParams();
    const { page, perPage } = list;
    const search = list.get('search');
    const statusFilter = pickAllowed(list.get('status'), TICKET_STATUSES);
    const catFilter = pickAllowed(list.get('category'), TICKET_CATEGORIES);
    const priFilter = pickAllowed(list.get('priority'), TICKET_PRIORITIES);
    // '' = all · 'over_sla' = only tickets whose current SLA deadline has passed.
    const slaFilter = pickAllowed(list.get('sla'), ['over_sla'] as const);
    // No sorting by a column this reader is not shown.
    const sortOptions = SORT_OPTIONS.filter((s) => canTake || (s !== 'priority_desc' && s !== 'sla_due'));
    const sort = pickAllowed(list.get('sort'), sortOptions) || DEFAULT_SORT;
    // Dashboard window (?range=7|90|custom with ?from&to); 30 days stays out of the URL.
    const range = readRange(list.get('range'), list.get('from'), list.get('to'));
    const setRange = (next: SummaryRange) =>
        list.setParams(
            typeof next === 'object'
                ? { range: 'custom', from: next.from, to: next.to }
                : { range: next === DEFAULT_RANGE ? null : String(next), from: null, to: null },
        );

    const [takeTicket, setTakeTicket] = useState<Ticket | null>(null);
    const [forwardTicket, setForwardTicket] = useState<Ticket | null>(null);

    // The detail drawer is URL-driven (?view=<id>): a reload / shared link reopens it and closing
    // drops the param. Opening seeds the cache with the clicked ticket for an instant open; a
    // deep-link (id not on the current page) fetches by id. URL = single source of truth.
    const qc = useQueryClient();
    // Only a real record id opens the drawer: Number('abc') is NaN, which passes an
    // `!= null` guard and used to fetch /tickets/NaN.
    const openId = toRecordId(searchParams.get('view'));
    const { data: detail, isError: detailMissing } = useQuery({
        queryKey: ['ticket', 'view', openId],
        queryFn: () => ticketApi.get(openId as number),
        enabled: openId != null,
    });
    const closeDetail = () =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.delete('view');
                return p;
            },
            { replace: true },
        );

    // The create form is URL-driven (?add=1) so a reload / shared link reopens it.
    const adding = searchParams.get('add') != null;
    const openCreate = () =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.set('add', '1');
                return p;
            },
            { replace: true },
        );
    const closeCreate = () =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.delete('add');
                return p;
            },
            { replace: true },
        );

    const [assignTicket, setAssignTicket] = useState<Ticket | null>(null);
    const [editTicket, setEditTicket] = useState<Ticket | null>(null);
    const [resolveState, setResolveState] = useState<{ ticket: Ticket; mode: ResolveMode } | null>(null);
    const [updateTicket, setUpdateTicket] = useState<Ticket | null>(null);

    // The record the drawer is currently showing, which outlives `detail` on the way out:
    // closing drops ?view=, the query switches off, and `detail` is undefined on the very
    // next render. The drawer keeps its own copy so its body survives the exit animation —
    // but the flags below are computed HERE from the record, and without the same retention
    // they flipped false on the first exit frame: the "nobody owns this case" banner
    // unmounted and the Take button left the footer, so the panel jumped a row shorter
    // while it was still fading. Open/closed still follows `detail`, not this.
    const [shownDetail, setShownDetail] = useState<Ticket | null>(null);
    useEffect(() => {
        if (detail) setShownDetail(detail);
    }, [detail]);
    const shownTicket = detail ?? shownDetail;

    // Editing is requester-only and only while the case is still Open — no
    // admin/super override (a case's content belongs to the person who opened it).
    // A case a service request opened is excluded outright: its words are a snapshot
    // of what was approved, and the endpoint refuses the edit (UpdateTicketRequest).
    // The requester also needs tickets.edit_own — the endpoint checks it first.
    const canEditDetail =
        has('tickets.edit_own') &&
        !!shownTicket &&
        shownTicket.status === 'open' &&
        shownTicket.requester_id === user?.employee_id &&
        !shownTicket.from_request;

    // Switch tab (?tab=): the new tab starts unfiltered on page 1, plus any `filters` given, in one write.
    const changeTab = (next: Tab, filters: Record<string, string> = {}) => {
        if (next === tab && Object.keys(filters).length === 0) return;
        setTab(next, {
            extra: (params) => {
                for (const key of LIST_KEYS) params.delete(key);
                for (const [key, value] of Object.entries(filters)) params.set(key, value);
            },
        });
    };

    const { data: summary, isLoading: summaryLoading } = useTicketSummary(canOverview, range);
    const lang = useUiStore((s) => s.lang);
    const {
        data: listData,
        isLoading,
        isFetching,
    } = useTickets({
        page,
        per_page: perPage,
        search,
        status: statusFilter || undefined,
        category: catFilter || undefined,
        priority: priFilter || undefined,
        sla: slaFilter || undefined,
        sort: sort !== DEFAULT_SORT ? sort : undefined,
        mine: tab === 'mine' || undefined,
        requested: tab === 'my' || undefined,
    });

    const rows = listData?.data ?? [];
    const meta = listData?.meta;

    // The dashboard's "Latest" card has its own fixed query — the tab list's
    // search / filters / sort / page must never leak into it.
    const { data: latestData } = useTickets({ page: 1, per_page: 5 }, canOverview && tab === 'overview');
    const latestRows = latestData?.data ?? [];

    const cats = summary?.by_category ?? [];
    const maxCat = Math.max(1, ...cats.map((c) => c.count));
    const totalCats = cats.reduce((sum, c) => sum + c.count, 0);

    const openDetail = (tk: Ticket) => {
        qc.setQueryData(['ticket', 'view', tk.id], tk);
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.set('view', String(tk.id));
                return p;
            },
            { replace: true },
        );
    };
    // Workflow modals stack over the still-open detail drawer (kept via ?view=) and bounce
    // back to it on save/close — matching the edit-over-detail pattern of the sibling modules.
    const startResolve = (tk: Ticket, mode: ResolveMode) => setResolveState({ ticket: tk, mode });

    // Filter-popover helpers (Stock-style): the active count drives the trigger badge;
    // reset clears every list filter back to "all".
    const activeFilterCount =
        (statusFilter ? 1 : 0) + (catFilter ? 1 : 0) + (priFilter ? 1 : 0) + (slaFilter ? 1 : 0) + (sort !== DEFAULT_SORT ? 1 : 0);
    const resetFilters = () => list.setParams({ status: null, category: null, priority: null, sla: null, sort: null, page: null });

    // Columns for the shared DataTable (All / Assigned-to-me tabs):
    // Request at · Ticket no. · Subject · Request by · Category · Priority · Status · Responsible by
    const columns: Column<Ticket>[] = [
        // A timestamp, a code, a person's name and a category name are single values: breaking one
        // across two lines makes a row twice as tall and reads as two facts. They keep their line,
        // and the subject beside them — the one column with a truncation already — gives up the
        // width instead. Before this, one CCTV case (a longer prefix, a longer category name) was
        // enough to wrap five columns of every row on the page.
        {
            key: 'created',
            header: t('ticket_request_at'),
            className: 'text-muted-foreground font-mono text-xs whitespace-nowrap',
            width: '145px',
            render: (tk) => fmtDateTime(tk.created_at),
        },
        {
            // The column that gives. `w-full max-w-0` hands it every pixel the fixed columns do
            // not want and lets it shrink to nothing, so the table fits its card at any width and
            // the subject truncates instead. Without it the table ran 11px past the card, and the
            // overhang it lost was the last column's right padding — a row that looked flush
            // against the edge while the first column sat properly inset.
            key: 'subject',
            header: t('ticket_subject'),
            className: 'truncate font-medium',
            render: (tk) => <TicketSubject ticket={tk} t={t} showNo />,
        },
        {
            key: 'requester',
            header: t('ticket_open_by'),
            className: 'truncate',
            width: '150px',
            render: (tk) => <span title={tk.requester_name ?? undefined}>{tk.requester_name ?? tk.requester_code}</span>,
        },
        {
            key: 'category',
            header: t('ticket_category'),
            className: 'whitespace-nowrap',
            width: '132px',
            render: (tk) => (
                <span className="flex items-center gap-2">
                    <TicketCategoryIcon category={tk.category} className="text-muted-foreground h-4 w-4" />
                    {t(`ticket_cat_${tk.category}`)}
                </span>
            ),
        },
        // Priority and the SLA clocks are the desk's own view of a case: one orders the queue,
        // the other measures the team against its targets. A requester chose neither and can act
        // on neither, and the API leaves both out for them too (TicketResource).
        ...(canTake
            ? [
                  {
                      key: 'priority',
                      header: t('ticket_priority'),
                      className: 'whitespace-nowrap',
                      width: '110px',
                      render: (tk: Ticket) => <TicketPriorityBadge priority={tk.priority ?? null} t={t} />,
                  },
              ]
            : []),
        {
            key: 'status',
            header: t('status'),
            className: 'whitespace-nowrap',
            width: '136px',
            render: (tk) => <TicketStatusBadge status={tk.status} t={t} />,
        },
        ...(canTake
            ? [
                  {
                      key: 'sla',
                      header: t('ticket_sla'),
                      className: 'whitespace-nowrap',
                      width: '146px',
                      // One chip: how much time is left. A repair case used to carry a second
                      // "Repair" chip here, from back when the countdown itself could mislead —
                      // it ran against the priority target and a case weeks inside its 30-day
                      // repair KPI read as one about to breach. The countdown reads the winning
                      // target now, so the chip was explaining a problem that no longer exists
                      // while wrapping the column onto two lines.
                      render: (tk: Ticket) => <TicketSlaBadge ticket={tk} t={t} />,
                  },
              ]
            : []),
        {
            key: 'assignee',
            header: t('ticket_responsible_by'),
            // Capped, not free: one long name would otherwise widen the column for every row.
            className: 'truncate',
            width: '170px',
            render: (tk) =>
                tk.assignee_name ? (
                    <span title={tk.assignee_name}>{tk.assignee_name}</span>
                ) : (
                    <span className="text-muted-foreground italic">{t('ticket_unassigned')}</span>
                ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('tickets_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('tickets_sub')}</p>
                </div>
                <div className="flex gap-2">
                    {canCreate && (
                        <Button onClick={openCreate}>
                            <Plus className="h-4 w-4" />
                            {t('new_ticket')}
                        </Button>
                    )}
                </div>
            </div>

            <Card className="overflow-clip">
                {/* Counts are outstanding work, so all three use the red pill. */}
                <PageTabs
                    tabs={visibleTabs.map((tb) => ({
                        id: tb,
                        label:
                            tb === 'overview'
                                ? t('ticket_tab_overview')
                                : tb === 'all'
                                  ? t('ticket_tab_all')
                                  : tb === 'mine'
                                    ? t('ticket_tab_mine')
                                    : t('ticket_tab_my'),
                        count: tb === 'all' ? meta?.open_count : tb === 'mine' ? meta?.my_jobs_count : tb === 'my' ? meta?.my_tickets_count : null,
                        tone: 'alert' as const,
                    }))}
                    active={tab}
                    onChange={(next) => changeTab(next)}
                />

                {tab === 'overview' && canOverview && (
                    <div className="p-5">
                        {/* Window selector stays put while the numbers below reload. */}
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Gauge className="text-muted-foreground h-4 w-4" />
                                <span className="text-sm font-semibold">{t('ticket_overview')}</span>
                            </div>
                            <RangeSelect value={range} onChange={setRange} t={t} />
                        </div>

                        {summaryLoading ? (
                            <TicketOverviewBodySkeleton />
                        ) : (
                            <div className="space-y-6">
                                {summary && (
                                    <TicketOverviewTiles
                                        summary={summary}
                                        when={
                                            typeof range === 'object' ? formatRangeShort(range.from, range.to, lang) : `${range} ${t('ticket_days')}`
                                        }
                                        canOpenReport={isIT}
                                        onOpenOverSla={() => changeTab('all', { sla: 'over_sla' })}
                                        onOpenWaiting={() => changeTab('all', { status: 'open' })}
                                    />
                                )}
                                <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                                    <Card className="overflow-hidden xl:col-span-2">
                                        <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
                                            <div className="flex items-center gap-2">
                                                <LayoutGrid className="text-muted-foreground h-4 w-4" />
                                                <span className="text-sm font-semibold">{t('ticket_by_category')}</span>
                                            </div>
                                            <span className="text-muted-foreground text-xs">
                                                <b className="text-foreground font-mono font-bold">{totalCats.toLocaleString('en-US')}</b>{' '}
                                                {t('ticket_trend_tickets')}
                                            </span>
                                        </div>
                                        <div className="space-y-4 p-5">
                                            {cats.map((c) => {
                                                const pct = totalCats > 0 ? Math.round((c.count / totalCats) * 100) : 0;
                                                return (
                                                    <div key={c.category} className="flex items-center gap-3">
                                                        <TicketCategoryIcon category={c.category} className="text-brand h-4 w-4 shrink-0" />
                                                        <span className="w-28 shrink-0 text-sm whitespace-nowrap">
                                                            {t(`ticket_cat_${c.category}`)}
                                                        </span>
                                                        <div className="bg-secondary h-2 flex-1 overflow-hidden rounded-full">
                                                            <div
                                                                className="bg-brand h-full rounded-full"
                                                                style={{ width: `${(c.count / maxCat) * 100}%` }}
                                                            />
                                                        </div>
                                                        <span className="w-16 shrink-0 text-right font-mono text-sm font-semibold whitespace-nowrap">
                                                            {c.count.toLocaleString('en-US')}{' '}
                                                            <span className="text-muted-foreground text-[11px] font-medium">{pct}%</span>
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </Card>

                                    <Card className="overflow-hidden xl:col-span-3">
                                        <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                                            <History className="text-muted-foreground h-4 w-4" />
                                            <span className="text-sm font-semibold">{t('ticket_latest')}</span>
                                            <button
                                                type="button"
                                                onClick={() => changeTab('all')}
                                                className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-0.5 text-xs font-medium transition-colors [@media(pointer:coarse)]:-my-2 [@media(pointer:coarse)]:py-2"
                                            >
                                                {t('ticket_view_all')}
                                                <ChevronRight className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        <TicketTable rows={latestRows} t={t} onRow={openDetail} compact showPriority={canTake} />
                                    </Card>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {(tab === 'all' || tab === 'mine' || tab === 'my') && (
                    <div className="space-y-3 p-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative w-full max-w-xs">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    value={search}
                                    onChange={(e) => list.setFilter('search', e.target.value)}
                                    placeholder={t('ticket_search')}
                                    className="pl-9"
                                />
                            </div>
                            <FilterPopover count={activeFilterCount} width={460} onClear={resetFilters} resultCount={meta?.total}>
                                {() => (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                <CircleDot className="h-3.5 w-3.5" />
                                                {t('status')}
                                            </div>
                                            <SearchableSelect
                                                active={statusFilter !== ''}
                                                value={statusFilter || ALL}
                                                onChange={(v) => list.setFilter('status', v === ALL ? '' : v)}
                                                options={[
                                                    { value: ALL, label: t('ticket_all'), search: t('ticket_all'), icon: <ToneDot tone="gray" /> },
                                                    ...(Object.keys(TICKET_STATUS_META) as TicketStatus[]).map((s) => ({
                                                        value: s,
                                                        label: t(TICKET_STATUS_META[s].key),
                                                        search: t(TICKET_STATUS_META[s].key),
                                                        icon: <ToneDot tone={TICKET_STATUS_META[s].tone} />,
                                                    })),
                                                ]}
                                            />
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                <Tag className="h-3.5 w-3.5" />
                                                {t('ticket_category')}
                                            </div>
                                            <SearchableSelect
                                                active={catFilter !== ''}
                                                value={catFilter || ALL}
                                                onChange={(v) => list.setFilter('category', v === ALL ? '' : v)}
                                                options={[
                                                    { value: ALL, label: t('ticket_all'), search: t('ticket_all'), icon: <ToneDot tone="gray" /> },
                                                    ...TICKET_CATEGORIES.map((c) => ({
                                                        value: c,
                                                        label: t(`ticket_cat_${c}`),
                                                        search: t(`ticket_cat_${c}`),
                                                        icon: <TicketCategoryIcon category={c} className="text-muted-foreground/70 h-4 w-4" />,
                                                    })),
                                                ]}
                                            />
                                        </div>
                                        {canTake && (
                                            <div>
                                                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                    <Flag className="h-3.5 w-3.5" />
                                                    {t('ticket_priority')}
                                                </div>
                                                <SearchableSelect
                                                    active={priFilter !== ''}
                                                    value={priFilter || ALL}
                                                    onChange={(v) => list.setFilter('priority', v === ALL ? '' : v)}
                                                    options={[
                                                        {
                                                            value: ALL,
                                                            label: t('ticket_all'),
                                                            search: t('ticket_all'),
                                                            icon: <ToneDot tone="gray" />,
                                                        },
                                                        ...(Object.keys(TICKET_PRIORITY_META) as TicketPriority[]).map((p) => ({
                                                            value: p,
                                                            label: t(TICKET_PRIORITY_META[p].key),
                                                            search: t(TICKET_PRIORITY_META[p].key),
                                                            icon: <ToneDot tone={TICKET_PRIORITY_META[p].tone} />,
                                                        })),
                                                    ]}
                                                />
                                            </div>
                                        )}
                                        {canTake && (
                                            <div>
                                                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                    <Gauge className="h-3.5 w-3.5" />
                                                    {t('ticket_sla')}
                                                </div>
                                                <SearchableSelect
                                                    active={slaFilter !== ''}
                                                    value={slaFilter || ALL}
                                                    onChange={(v) => list.setFilter('sla', v === ALL ? '' : 'over_sla')}
                                                    options={[
                                                        {
                                                            value: ALL,
                                                            label: t('ticket_all'),
                                                            search: t('ticket_all'),
                                                            icon: <ToneDot tone="gray" />,
                                                        },
                                                        {
                                                            value: 'over_sla',
                                                            label: t('ticket_sla_filter_overdue'),
                                                            search: t('ticket_sla_filter_overdue'),
                                                            icon: <ToneDot tone="red" />,
                                                        },
                                                    ]}
                                                />
                                            </div>
                                        )}
                                        <div>
                                            <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                <ArrowUpDown className="h-3.5 w-3.5" />
                                                {t('ticket_sort_by')}
                                            </div>
                                            <SearchableSelect
                                                active={sort !== DEFAULT_SORT}
                                                value={sort}
                                                onChange={(v) => list.setFilter('sort', v === DEFAULT_SORT ? '' : v)}
                                                options={sortOptions.map((s) => ({
                                                    value: s,
                                                    label: t(SORT_LABEL[s]),
                                                    search: t(SORT_LABEL[s]),
                                                }))}
                                            />
                                        </div>
                                    </div>
                                )}
                            </FilterPopover>
                            {activeFilterCount > 0 && (
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="border-border text-muted-foreground hover:bg-accent hover:text-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                                >
                                    <X className="h-3 w-3" />
                                    {t('reset_filters')}
                                </button>
                            )}
                        </div>

                        <DataTable
                            columns={columns}
                            rows={rows}
                            rowKey={(tk) => tk.id}
                            onRowClick={openDetail}
                            loading={isLoading || isFetching}
                            emptyState={<span>{t('ticket_none')}</span>}
                            server={{ ...list.table.paging, total: meta?.total ?? 0 }}
                        />
                    </div>
                )}
            </Card>

            <CreateTicketDrawer open={adding} onClose={closeCreate} />
            {/* The drawer bails out on a null record, so a dead ?view= link had nothing to
                render and said nothing. This says it instead. */}
            <RecordMissingDialog open={detailMissing} onClose={() => closeDetail()} />
            <TicketDetailDrawer
                ticket={detail ?? null}
                onClose={() => closeDetail()}
                canTake={canTake && (shownTicket ? hasLevel(shownTicket.category) : false)}
                canAssign={canAssign}
                canForward={canForward}
                meId={user?.id}
                meEmployeeId={user?.employee_id}
                canEdit={canEditDetail}
                onEdit={(tk) => setEditTicket(tk)}
                onTake={(tk) => setTakeTicket(tk)}
                onAssign={(tk) => setAssignTicket(tk)}
                onForward={(tk) => setForwardTicket(tk)}
                onResolve={startResolve}
                onUpdate={(tk) => setUpdateTicket(tk)}
            />
            <EditTicketDrawer ticket={editTicket} onClose={() => setEditTicket(null)} />
            <TakeCaseModal ticket={takeTicket} onClose={() => setTakeTicket(null)} />
            <AssignTicketModal ticket={assignTicket} onClose={() => setAssignTicket(null)} />
            <ForwardTicketModal ticket={forwardTicket} onClose={() => setForwardTicket(null)} />
            <TicketUpdateModal ticket={updateTicket} canSetWorkClass={canSetWorkClass} onClose={() => setUpdateTicket(null)} />
            <ResolveTicketModal ticket={resolveState?.ticket ?? null} mode={resolveState?.mode ?? null} onClose={() => setResolveState(null)} />
        </div>
    );
}

/** Shared ticket table used by both the dashboard preview and the list tabs. */
function TicketTable({
    rows,
    t,
    onRow,
    compact,
    showPriority,
}: {
    rows: Ticket[];
    t: (k: string) => string;
    onRow: (tk: Ticket) => void;
    compact?: boolean;
    /** Mirrors the Take Case gate — see the priority column on the main list. */
    showPriority: boolean;
}) {
    if (rows.length === 0) {
        return <div className="text-muted-foreground py-10 text-center text-sm">{t('ticket_none')}</div>;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                        <th className="px-4 py-2.5">ID</th>
                        <th className="px-4 py-2.5">{t('ticket_subject')}</th>
                        <th className="px-4 py-2.5">{t('ticket_category')}</th>
                        {showPriority && <th className="px-4 py-2.5">{t('ticket_priority')}</th>}
                        <th className="px-4 py-2.5">{t('status')}</th>
                        {!compact && <th className="px-4 py-2.5">{t('ticket_requester')}</th>}
                        <th className="px-4 py-2.5">{t('ticket_assignee')}</th>
                        {!compact && <th className="px-4 py-2.5">{t('ticket_updated')}</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((tk) => (
                        <tr
                            key={tk.id}
                            className="border-border/60 hover:bg-accent/40 cursor-pointer border-b last:border-0"
                            onClick={() => onRow(tk)}
                        >
                            <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">{tk.ticket_no}</td>
                            <td className="w-full max-w-0 px-4 py-2.5 font-medium">
                                <TicketSubject ticket={tk} t={t} />
                            </td>
                            <td className="px-4 py-2.5">
                                <span className="flex items-center gap-2">
                                    <TicketCategoryIcon category={tk.category} className="text-muted-foreground h-4 w-4" />
                                    {t(`ticket_cat_${tk.category}`)}
                                </span>
                            </td>
                            {showPriority && (
                                <td className="px-4 py-2.5">
                                    <TicketPriorityBadge priority={tk.priority ?? null} t={t} />
                                </td>
                            )}
                            <td className="px-4 py-2.5">
                                <TicketStatusBadge status={tk.status} t={t} />
                            </td>
                            {!compact && (
                                <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">{tk.requester_code ?? tk.requester_name}</td>
                            )}
                            <td className="max-w-[170px] truncate px-4 py-2.5">
                                {tk.assignee_name ? (
                                    <span title={tk.assignee_name}>{tk.assignee_name}</span>
                                ) : (
                                    <span className="text-muted-foreground italic">{t('ticket_unassigned')}</span>
                                )}
                            </td>
                            {!compact && <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">{fmtDateTime(tk.updated_at, false)}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
