import { Column, DataTable } from '@/shared/components/data-table';
import { AssignTicketModal } from '../components/assign-ticket-modal';
import { CreateTicketDrawer } from '../components/create-ticket-drawer';
import { EditTicketDrawer } from '../components/edit-ticket-drawer';
import { ResolveTicketModal, type ResolveMode } from '../components/resolve-ticket-modal';
import { TakeCaseModal } from '../components/take-case-modal';
import { TicketDetailDrawer } from '../components/ticket-detail-drawer';
import {
    TICKET_CATEGORIES,
    TICKET_PRIORITY_META,
    TICKET_STATUS_META,
    TicketCategoryIcon,
    TicketPriorityBadge,
    TicketStatusBadge,
} from '../components/ticket-meta';
import { FilterPopover } from '@/shared/components/filter-popover';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { ToneDot } from '@/shared/components/status-badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { useAuth } from '@/modules/auth';
import { ticketApi } from '../api/ticketApi';
import { useTickets, useTicketSummary } from '../hooks/use-tickets';
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { Role, Ticket, TicketCategory, TicketPriority, TicketStatus } from '@/shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Box,
    CheckCircle2,
    CircleDot,
    Download,
    Flag,
    Gauge,
    Inbox,
    Layers,
    Minus,
    Plus,
    Search,
    Tag,
    X,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// The page's tabs. The active tab is mirrored in the URL (?tab=) so a reload / shared link stays put.
const TAB_IDS = ['dashboard', 'all', 'mine'] as const;
type Tab = (typeof TAB_IDS)[number];
const ALL = '__all__';

// Server-side sort orders for the list tabs; the first is the backend default.
const DEFAULT_SORT = 'created_desc';
const SORT_OPTIONS = ['created_desc', 'created_asc', 'updated_desc', 'priority_desc'] as const;
const SORT_LABEL: Record<(typeof SORT_OPTIONS)[number], string> = {
    created_desc: 'ticket_sort_newest',
    created_asc: 'ticket_sort_oldest',
    updated_desc: 'ticket_sort_updated',
    priority_desc: 'ticket_sort_priority',
};

const isTicketTab = (v: string | null): v is Tab => (TAB_IDS as readonly string[]).includes(v ?? '');

/** Resolve the starting tab from the URL (?tab=); non-IT users only have the "all" tab. */
function initialTicketTab(isIT: boolean): Tab {
    const fromUrl = new URLSearchParams(window.location.search).get('tab');
    if (isTicketTab(fromUrl) && (isIT || fromUrl === 'all')) return fromUrl;
    return isIT ? 'dashboard' : 'all';
}

/**
 * A ↑/↓ change pill, colored by direction: up = green, down = red, flat = gray.
 * `goodUp: false` flips the meaning for a metric where rising is bad (up → red).
 */
function TrendPill({ delta, goodUp, suffix }: { delta: number; goodUp?: boolean; suffix?: string }) {
    const flat = delta === 0;
    const up = delta > 0;
    const good = goodUp === undefined ? up : up === goodUp;
    const tone = flat ? 'text-muted-foreground' : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive';
    const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
    return (
        <span className={cn('inline-flex items-center gap-0.5 font-medium', tone)}>
            <Icon className="h-3.5 w-3.5" />
            {Math.abs(delta)}
            {suffix ?? '%'}
        </span>
    );
}

function StatCard({
    label,
    value,
    icon: Icon,
    trend,
    hint,
}: {
    label: string;
    value: string | number;
    icon: typeof Box;
    trend?: { delta: number | null; goodUp?: boolean; suffix?: string };
    hint?: React.ReactNode;
}) {
    return (
        <Card className="p-5">
            <div className="flex items-start justify-between">
                <div className="text-muted-foreground text-sm">{label}</div>
                <span className="bg-brand/10 text-brand flex h-9 w-9 items-center justify-center rounded-lg">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
            {(trend?.delta != null || hint) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs">
                    {trend?.delta != null && <TrendPill delta={trend.delta} goodUp={trend.goodUp} suffix={trend.suffix} />}
                    {hint && <span className="text-muted-foreground">{hint}</span>}
                </div>
            )}
        </Card>
    );
}

/** 7 / 30 / 90-day window selector for the dashboard. */
function RangeSelect({ value, onChange, t }: { value: number; onChange: (v: number) => void; t: (k: string) => string }) {
    return (
        <div className="border-border inline-flex rounded-lg border p-0.5">
            {[7, 30, 90].map((d) => (
                <button
                    key={d}
                    onClick={() => onChange(d)}
                    className={cn(
                        'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                        value === d ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {d} {t('ticket_days')}
                </button>
            ))}
        </div>
    );
}

/** Loading placeholder for the dashboard body (KPI cards + category bars + latest list). */
function TicketDashboardBodySkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="p-5">
                        <div className="flex items-start justify-between">
                            <div className="bg-muted h-4 w-20 animate-pulse rounded" />
                            <div className="bg-muted h-9 w-9 animate-pulse rounded-lg" />
                        </div>
                        <div className="bg-muted mt-3 h-8 w-14 animate-pulse rounded" />
                        <div className="bg-muted mt-2 h-3 w-24 animate-pulse rounded" />
                    </Card>
                ))}
            </div>
            <div>
                <div className="bg-muted mb-3 h-3 w-32 animate-pulse rounded" />
                <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="bg-muted h-4 w-28 shrink-0 animate-pulse rounded" />
                            <div className="bg-muted h-2 flex-1 animate-pulse rounded-full" />
                            <div className="bg-muted h-4 w-6 shrink-0 animate-pulse rounded" />
                        </div>
                    ))}
                </div>
            </div>
            <div>
                <div className="bg-muted mb-3 h-3 w-24 animate-pulse rounded" />
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="bg-muted h-8 w-full animate-pulse rounded" />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function TicketsPage() {
    const t = useT();
    const { user } = useAuth();
    const role = (user?.role ?? 'user') as Role;
    const perms = user?.permissions ?? [];
    const isSuper = role === 'super';
    const isIT = isSuper || perms.includes('tickets.view_all');
    const canCreate = isSuper || perms.includes('tickets.create');

    const [searchParams, setSearchParams] = useSearchParams();
    const [tab, setTab] = useState<Tab>(() => initialTicketTab(isIT));
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
    const [catFilter, setCatFilter] = useState<TicketCategory | ''>('');
    const [priFilter, setPriFilter] = useState<TicketPriority | ''>('');
    const [sort, setSort] = useState(DEFAULT_SORT);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const [range, setRange] = useState(30); // dashboard window: 7 / 30 / 90 days

    const [takeTicket, setTakeTicket] = useState<Ticket | null>(null);

    // The detail drawer is URL-driven (?view=<id>): a reload / shared link reopens it and closing
    // drops the param. Opening seeds the cache with the clicked ticket for an instant open; a
    // deep-link (id not on the current page) fetches by id. URL = single source of truth.
    const qc = useQueryClient();
    const viewId = searchParams.get('view');
    const openId = viewId ? Number(viewId) : null;
    const { data: detail } = useQuery({
        queryKey: ['ticket', 'view', openId],
        queryFn: () => ticketApi.get(openId as number),
        enabled: openId != null,
    });
    const closeDetail = () =>
        setSearchParams((sp) => {
            const p = new URLSearchParams(sp);
            p.delete('view');
            return p;
        }, { replace: true });

    // The create form is URL-driven (?add=1) so a reload / shared link reopens it.
    const adding = searchParams.get('add') != null;
    const openCreate = () =>
        setSearchParams((sp) => {
            const p = new URLSearchParams(sp);
            p.set('add', '1');
            return p;
        }, { replace: true });
    const closeCreate = () =>
        setSearchParams((sp) => {
            const p = new URLSearchParams(sp);
            p.delete('add');
            return p;
        }, { replace: true });

    const [assignTicket, setAssignTicket] = useState<Ticket | null>(null);
    const [editTicket, setEditTicket] = useState<Ticket | null>(null);
    const [resolveState, setResolveState] = useState<{ ticket: Ticket; mode: ResolveMode } | null>(null);

    // Editing is requester-only and only while the case is still Open — no
    // admin/super override (a case's content belongs to the person who opened it).
    const canEditDetail = !!detail && detail.status === 'open' && detail.requester_id === user?.employee_id;

    // Switch tab and mirror it in the URL (?tab=) so reloads / shared links stay put.
    const changeTab = useCallback(
        (next: Tab) => {
            setTab(next);
            setPage(1);
            setSearchParams(
                (prev) => {
                    const sp = new URLSearchParams(prev);
                    sp.set('tab', next);
                    return sp;
                },
                { replace: true },
            );
        },
        [setSearchParams],
    );

    const { data: summary, isLoading: summaryLoading } = useTicketSummary(isIT, range);
    const { data: listData, isLoading, isFetching } = useTickets({
        page,
        per_page: perPage,
        search,
        status: statusFilter || undefined,
        category: catFilter || undefined,
        priority: priFilter || undefined,
        sort: sort !== DEFAULT_SORT ? sort : undefined,
        mine: tab === 'mine' || undefined,
    });

    const rows = listData?.data ?? [];
    const meta = listData?.meta;

    const cats = summary?.by_category ?? [];
    const maxCat = Math.max(1, ...cats.map((c) => c.count));

    const openDetail = (tk: Ticket) => {
        qc.setQueryData(['ticket', 'view', tk.id], tk);
        setSearchParams((sp) => {
            const p = new URLSearchParams(sp);
            p.set('view', String(tk.id));
            return p;
        }, { replace: true });
    };
    // Workflow modals stack over the still-open detail drawer (kept via ?view=) and bounce
    // back to it on save/close — matching the edit-over-detail pattern of the sibling modules.
    const startResolve = (tk: Ticket, mode: ResolveMode) => setResolveState({ ticket: tk, mode });

    // Filter-popover helpers (Stock-style): the active count drives the trigger badge;
    // reset clears every list filter back to "all".
    const activeFilterCount = (statusFilter ? 1 : 0) + (catFilter ? 1 : 0) + (priFilter ? 1 : 0) + (sort !== DEFAULT_SORT ? 1 : 0);
    const resetFilters = () => {
        setStatusFilter('');
        setCatFilter('');
        setPriFilter('');
        setSort(DEFAULT_SORT);
        setPage(1);
    };

    // Columns for the shared DataTable (All / Assigned-to-me tabs).
    const columns: Column<Ticket>[] = [
        { key: 'ticket_no', header: 'ID', className: 'text-muted-foreground font-mono text-xs', render: (tk) => tk.ticket_no },
        {
            key: 'subject',
            header: t('ticket_subject'),
            className: 'font-medium',
            render: (tk) => <span className="block max-w-[280px] truncate">{tk.subject}</span>,
        },
        {
            key: 'category',
            header: t('ticket_category'),
            render: (tk) => (
                <span className="flex items-center gap-2">
                    <TicketCategoryIcon category={tk.category} className="text-muted-foreground h-4 w-4" />
                    {t(`ticket_cat_${tk.category}`)}
                </span>
            ),
        },
        { key: 'priority', header: t('ticket_priority'), render: (tk) => <TicketPriorityBadge priority={tk.priority} t={t} /> },
        { key: 'status', header: t('status'), render: (tk) => <TicketStatusBadge status={tk.status} t={t} /> },
        {
            key: 'requester',
            header: t('ticket_requester'),
            className: 'text-muted-foreground font-mono text-xs',
            render: (tk) => tk.requester_code ?? tk.requester_name,
        },
        {
            key: 'assignee',
            header: t('ticket_assignee'),
            render: (tk) => tk.assignee_name ?? <span className="text-muted-foreground italic">{t('ticket_unassigned')}</span>,
        },
        {
            key: 'updated',
            header: t('ticket_updated'),
            className: 'text-muted-foreground font-mono text-xs',
            render: (tk) => tk.updated_at?.slice(0, 10),
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
                    <Button variant="outline" disabled>
                        <Download className="h-4 w-4" />
                        {t('export')}
                    </Button>
                    {canCreate && (
                        <Button onClick={openCreate}>
                            <Plus className="h-4 w-4" />
                            {t('new_ticket')}
                        </Button>
                    )}
                </div>
            </div>

            <Card className="overflow-hidden">
                <div className="border-border flex gap-1 border-b px-2">
                    {(isIT ? (['dashboard', 'all', 'mine'] as Tab[]) : (['all'] as Tab[])).map((tb) => (
                        <button
                            key={tb}
                            onClick={() => changeTab(tb)}
                            className={cn(
                                'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                                tab === tb ? 'border-brand text-brand' : 'text-muted-foreground hover:text-foreground border-transparent',
                            )}
                        >
                            {tb === 'dashboard' ? t('ticket_tab_dashboard') : tb === 'all' ? t('ticket_tab_all') : t('ticket_tab_mine')}
                        </button>
                    ))}
                </div>

                {tab === 'dashboard' && isIT && (
                    <div className="p-5">
                        {/* Window selector stays put while the numbers below reload. */}
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{t('ticket_overview')}</div>
                            <RangeSelect value={range} onChange={setRange} t={t} />
                        </div>

                        {summaryLoading ? (
                            <TicketDashboardBodySkeleton />
                        ) : (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                                    <StatCard
                                        label={t('ticket_kpi_new')}
                                        value={summary?.created ?? 0}
                                        icon={Inbox}
                                        trend={{ delta: summary?.created_delta_pct ?? null }}
                                        hint={t('ticket_kpi_vs_prev')}
                                    />
                                    <StatCard
                                        label={t('ticket_kpi_resolved')}
                                        value={summary?.resolved ?? 0}
                                        icon={CheckCircle2}
                                        trend={{ delta: summary?.resolved_delta_pct ?? null, goodUp: true }}
                                        hint={t('ticket_kpi_in_range')}
                                    />
                                    <StatCard
                                        label={t('ticket_kpi_backlog')}
                                        value={summary?.backlog ?? 0}
                                        icon={Layers}
                                        hint={`${summary?.backlog_open ?? 0} ${t('ticket_kpi_waiting')} · ${summary?.backlog_in_progress ?? 0} ${t('ticket_kpi_working')}`}
                                    />
                                    <StatCard
                                        label={t('ticket_sla_met')}
                                        value={summary?.sla_met_pct == null ? '—' : `${summary.sla_met_pct}%`}
                                        icon={Gauge}
                                        trend={{ delta: summary?.sla_delta_pts ?? null, goodUp: true, suffix: ` ${t('ticket_pts')}` }}
                                        hint={t('ticket_kpi_on_target')}
                                    />
                                </div>

                                <div>
                                    <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                                        {t('ticket_by_category')}
                                    </div>
                                    <div className="space-y-2">
                                        {cats.map((c) => (
                                            <div key={c.category} className="flex items-center gap-3">
                                                <div className="flex w-28 items-center gap-2 text-sm">
                                                    <TicketCategoryIcon category={c.category} className="text-muted-foreground h-4 w-4" />
                                                    {t(`ticket_cat_${c.category}`)}
                                                </div>
                                                <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                                                    <div className="bg-brand h-full rounded-full" style={{ width: `${(c.count / maxCat) * 100}%` }} />
                                                </div>
                                                <div className="w-8 text-right font-mono text-sm">{c.count}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{t('ticket_latest')}</div>
                                    <TicketTable rows={rows.slice(0, 5)} t={t} onRow={openDetail} compact />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {(tab === 'all' || tab === 'mine') && (
                    <div className="space-y-3 p-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative w-full max-w-xs">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(1);
                                    }}
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
                                                onChange={(v) => {
                                                    setStatusFilter(v === ALL ? '' : (v as TicketStatus));
                                                    setPage(1);
                                                }}
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
                                                onChange={(v) => {
                                                    setCatFilter(v === ALL ? '' : (v as TicketCategory));
                                                    setPage(1);
                                                }}
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
                                        <div>
                                            <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                <Flag className="h-3.5 w-3.5" />
                                                {t('ticket_priority')}
                                            </div>
                                            <SearchableSelect
                                                active={priFilter !== ''}
                                                value={priFilter || ALL}
                                                onChange={(v) => {
                                                    setPriFilter(v === ALL ? '' : (v as TicketPriority));
                                                    setPage(1);
                                                }}
                                                options={[
                                                    { value: ALL, label: t('ticket_all'), search: t('ticket_all'), icon: <ToneDot tone="gray" /> },
                                                    ...(Object.keys(TICKET_PRIORITY_META) as TicketPriority[]).map((p) => ({
                                                        value: p,
                                                        label: t(TICKET_PRIORITY_META[p].key),
                                                        search: t(TICKET_PRIORITY_META[p].key),
                                                        icon: <ToneDot tone={TICKET_PRIORITY_META[p].tone} />,
                                                    })),
                                                ]}
                                            />
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                <ArrowUpDown className="h-3.5 w-3.5" />
                                                {t('ticket_sort_by')}
                                            </div>
                                            <SearchableSelect
                                                active={sort !== DEFAULT_SORT}
                                                value={sort}
                                                onChange={(v) => {
                                                    setSort(v);
                                                    setPage(1);
                                                }}
                                                options={SORT_OPTIONS.map((s) => ({
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
                            server={{
                                page,
                                pageSize: perPage,
                                total: meta?.total ?? 0,
                                onPageChange: setPage,
                                onPageSizeChange: (s) => {
                                    setPerPage(s);
                                    setPage(1);
                                },
                            }}
                        />
                    </div>
                )}
            </Card>

            <CreateTicketDrawer open={adding} onClose={closeCreate} />
            <TicketDetailDrawer
                ticket={detail ?? null}
                onClose={() => closeDetail()}
                isIT={isIT}
                isSuper={isSuper}
                meId={user?.id}
                canEdit={canEditDetail}
                onEdit={(tk) => setEditTicket(tk)}
                onTake={(tk) => setTakeTicket(tk)}
                onAssign={(tk) => setAssignTicket(tk)}
                onResolve={startResolve}
            />
            <EditTicketDrawer ticket={editTicket} onClose={() => setEditTicket(null)} />
            <TakeCaseModal ticket={takeTicket} onClose={() => setTakeTicket(null)} />
            <AssignTicketModal ticket={assignTicket} onClose={() => setAssignTicket(null)} />
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
}: {
    rows: Ticket[];
    t: (k: string) => string;
    onRow: (tk: Ticket) => void;
    compact?: boolean;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                        <th className="px-4 py-2.5">ID</th>
                        <th className="px-4 py-2.5">{t('ticket_subject')}</th>
                        <th className="px-4 py-2.5">{t('ticket_category')}</th>
                        <th className="px-4 py-2.5">{t('ticket_priority')}</th>
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
                            <td className="max-w-[280px] truncate px-4 py-2.5 font-medium">{tk.subject}</td>
                            <td className="px-4 py-2.5">
                                <span className="flex items-center gap-2">
                                    <TicketCategoryIcon category={tk.category} className="text-muted-foreground h-4 w-4" />
                                    {t(`ticket_cat_${tk.category}`)}
                                </span>
                            </td>
                            <td className="px-4 py-2.5">
                                <TicketPriorityBadge priority={tk.priority} t={t} />
                            </td>
                            <td className="px-4 py-2.5">
                                <TicketStatusBadge status={tk.status} t={t} />
                            </td>
                            {!compact && (
                                <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">{tk.requester_code ?? tk.requester_name}</td>
                            )}
                            <td className="px-4 py-2.5">
                                {tk.assignee_name ?? <span className="text-muted-foreground italic">{t('ticket_unassigned')}</span>}
                            </td>
                            {!compact && <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">{tk.updated_at?.slice(0, 10)}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
