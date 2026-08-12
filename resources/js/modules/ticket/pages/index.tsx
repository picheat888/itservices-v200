import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { Column, DataTable } from '@/shared/components/data-table';
import { FilterPopover } from '@/shared/components/filter-popover';
import { RecordMissingDialog } from '@/shared/components/record-missing';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { ToneDot } from '@/shared/components/status-badge';
import { formatDateTime as fmtDateTime } from '@/shared/lib/datetime';
import { cn, toRecordId } from '@/shared/lib/utils';
import type { Ticket, TicketCategory, TicketPriority, TicketStatus } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { DateInput } from '@/shared/ui/date-input';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Box,
    CheckCircle2,
    ChevronRight,
    CircleDot,
    Clock,
    Download,
    Flag,
    Gauge,
    History,
    Inbox,
    Layers,
    LayoutGrid,
    Minus,
    Plus,
    RefreshCcw,
    Search,
    Tag,
    Timer,
    X,
    Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
    slaDuration,
    TICKET_CATEGORIES,
    TICKET_PRIORITY_META,
    TICKET_STATUS_META,
    TicketCategoryIcon,
    TicketPriorityBadge,
    TicketSlaBadge,
    TicketStatusBadge,
} from '../components/ticket-meta';
import { useTickets, useTicketSummary } from '../hooks/use-tickets';

// The page's tabs. The active tab is mirrored in the URL (?tab=) so a reload / shared link stays put.
const TAB_IDS = ['dashboard', 'all', 'mine', 'my'] as const;
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

/** Resolve the starting tab from the URL (?tab=), falling back to the first visible tab. */
function initialTicketTab(visibleTabs: readonly Tab[]): Tab {
    const fromUrl = new URLSearchParams(window.location.search).get('tab');
    if (isTicketTab(fromUrl) && visibleTabs.includes(fromUrl)) return fromUrl;
    // A role with no ticket tabs at all still lands somewhere harmless.
    return visibleTabs[0] ?? 'my';
}

/**
 * A ↑/↓ change pill spelled out in words ("เพิ่มขึ้น 33%" / "ลดลง 33%"), colored by
 * direction: up = green, down = red, flat = gray. `goodUp: false` flips the meaning
 * for a metric where rising is bad (up → red). Time-based metrics can swap the
 * direction words via upKey/downKey (e.g. ช้าลง/เร็วขึ้น N นาที).
 */
function TrendPill({
    delta,
    goodUp,
    suffix,
    upKey = 'ticket_trend_up',
    downKey = 'ticket_trend_down',
}: {
    delta: number;
    goodUp?: boolean;
    suffix?: string;
    upKey?: string;
    downKey?: string;
}) {
    const t = useT();
    const flat = delta === 0;
    const up = delta > 0;
    const good = goodUp === undefined ? up : up === goodUp;
    const tone = flat ? 'text-muted-foreground' : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive';
    const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
    return (
        <span className={cn('inline-flex items-center gap-0.5 font-medium', tone)}>
            <Icon className="h-3.5 w-3.5" />
            {flat ? t('ticket_trend_flat') : `${t(up ? upKey : downKey)} ${Math.abs(delta).toLocaleString('en-US')}${suffix ?? '%'}`}
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
    trend?: { delta: number | null; goodUp?: boolean; suffix?: string; upKey?: string; downKey?: string };
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
            {/* Counts get thousand separators; preformatted strings (%, durations) pass through. */}
            <div className="mt-2 font-mono text-3xl font-bold">{typeof value === 'number' ? value.toLocaleString('en-US') : value}</div>
            {(trend?.delta != null || hint) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs">
                    {trend?.delta != null && (
                        <TrendPill delta={trend.delta} goodUp={trend.goodUp} suffix={trend.suffix} upKey={trend.upKey} downKey={trend.downKey} />
                    )}
                    {hint && <span className="text-muted-foreground">{hint}</span>}
                </div>
            )}
        </Card>
    );
}

/**
 * A single "right now" status row (icon + title/sub + trailing value) in the
 * Access-dashboard idiom: red = act now, amber = needs a look, green = all clear,
 * ink = neutral info. With `onClick` the row becomes a drill-down button into
 * the Tickets tab with the matching filter applied.
 */
function NowRow({
    icon: Icon,
    tone,
    title,
    sub,
    value,
    onClick,
}: {
    icon: typeof Box;
    tone: 'red' | 'amber' | 'green' | 'ink';
    title: string;
    sub: string;
    value: string | number;
    onClick?: () => void;
}) {
    const toneClass = {
        red: 'text-destructive',
        amber: 'text-amber-600 dark:text-amber-400',
        green: 'text-emerald-600 dark:text-emerald-400',
        ink: 'text-muted-foreground',
    }[tone];
    // Alert rows (red/amber) get a soft tinted background + a count pill so they
    // stand out from the all-clear rows; same paddings keep the card height stable.
    const isAlert = tone === 'red' || tone === 'amber';
    const rowTint = {
        red: 'bg-destructive/[0.06] hover:bg-destructive/10',
        amber: 'bg-amber-500/[0.07] hover:bg-amber-500/15',
        green: '',
        ink: '',
    }[tone];
    const body = (
        <>
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', toneClass)} />
            <div className="min-w-0 flex-1 text-left">
                <div className="text-sm font-medium">{title}</div>
                <div className="text-muted-foreground text-xs">{sub}</div>
            </div>
            {isAlert ? (
                <span
                    className={cn(
                        'rounded-full px-2 py-px font-mono text-xs font-bold',
                        tone === 'red' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                    )}
                >
                    {typeof value === 'number' ? value.toLocaleString('en-US') : value}
                </span>
            ) : (
                <span className={cn('font-mono text-sm font-semibold', toneClass)}>
                    {typeof value === 'number' ? value.toLocaleString('en-US') : value}
                </span>
            )}
        </>
    );
    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                className={cn('flex w-full items-start gap-3 rounded-lg px-3 py-2.5 transition-colors', rowTint || 'hover:bg-muted/40')}
            >
                {body}
            </button>
        );
    }
    return <div className={cn('flex items-start gap-3 rounded-lg px-3 py-2.5', rowTint)}>{body}</div>;
}

/** 7 / 30 / 90-day window selector for the dashboard, plus a custom from–to date pair. */
function RangeSelect({ value, onChange, t }: { value: SummaryRange; onChange: (v: SummaryRange) => void; t: (k: string) => string }) {
    const custom = typeof value === 'object';
    const [open, setOpen] = useState(false);
    // Draft dates live locally and only apply on confirm, so half-picked ranges never fetch.
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    // Inverted order gets a loud red message — a silently disabled button explains nothing.
    const inverted = !!from && !!to && from > to;

    const handleOpenChange = (o: boolean) => {
        if (o) {
            setFrom(custom ? value.from : '');
            setTo(custom ? value.to : '');
        }
        setOpen(o);
    };

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
            <Popover open={open} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    <button
                        className={cn(
                            'rounded-md px-3 py-1 font-mono text-xs font-medium transition-colors',
                            custom ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground font-sans',
                        )}
                    >
                        {custom ? `${value.from} – ${value.to}` : t('ticket_range_custom')}
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto space-y-3 p-3">
                    <div className="flex items-end gap-2">
                        <div>
                            <div className="text-muted-foreground mb-1.5 text-xs font-medium">{t('ticket_range_from')}</div>
                            <DateInput value={from} onChange={setFrom} className={cn('h-9 w-36', inverted && 'border-destructive')} />
                        </div>
                        <span className="text-muted-foreground pb-2.5 text-xs">–</span>
                        <div>
                            <div className="text-muted-foreground mb-1.5 text-xs font-medium">{t('ticket_range_to')}</div>
                            <DateInput value={to} onChange={setTo} className={cn('h-9 w-36', inverted && 'border-destructive')} />
                        </div>
                    </div>
                    {inverted && (
                        <p className="text-destructive flex items-center gap-1.5 text-xs">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            {t('ticket_range_err_order')}
                        </p>
                    )}
                    <Button
                        size="sm"
                        className="w-full"
                        disabled={!from || !to || inverted}
                        onClick={() => {
                            onChange({ from, to });
                            setOpen(false);
                        }}
                    >
                        {t('ticket_range_apply')}
                    </Button>
                </PopoverContent>
            </Popover>
        </div>
    );
}

/** Loading placeholder for the dashboard body (KPI cards + category bars + latest list). */
function TicketDashboardBodySkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
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
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="overflow-hidden">
                    <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                        <div className="bg-muted h-4 w-4 animate-pulse rounded" />
                        <div className="bg-muted h-4 w-36 animate-pulse rounded" />
                    </div>
                    <div className="space-y-4 p-5">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="bg-muted h-4 w-28 shrink-0 animate-pulse rounded" />
                                <div className="bg-muted h-2 flex-1 animate-pulse rounded-full" />
                                <div className="bg-muted h-4 w-10 shrink-0 animate-pulse rounded" />
                            </div>
                        ))}
                    </div>
                </Card>
                <Card className="overflow-hidden">
                    <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                        <div className="bg-muted h-4 w-4 animate-pulse rounded" />
                        <div className="bg-muted h-4 w-32 animate-pulse rounded" />
                    </div>
                    <div className="space-y-2 p-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="bg-muted h-11 w-full animate-pulse rounded-lg" />
                        ))}
                    </div>
                </Card>
            </div>
            <Card className="overflow-hidden">
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
    );
}

export default function TicketsPage() {
    const t = useT();
    // System-timezone formatter (Settings -> Company) — the API emits UTC timestamps.
    const { user, can: has } = useAuth();
    const isIT = has('tickets.view_all');
    const canCreate = has('tickets.create');
    const canDashboard = has('tickets.view_dashboard');
    const canJobs = has('tickets.jobs');
    // My Tickets (requester view) has its own gate so it can be granted per role.
    const canMyTickets = has('tickets.my');
    // Take Case mirrors the backend gates: tickets.resolve + the matching Ticket Level.
    const canTake = has('tickets.resolve');
    const hasLevel = (category: string) => has(`tickets.level_${category}`);
    // Assign / Forward mirror their backend gates.
    const canAssign = has('tickets.assign');
    const canForward = has('tickets.forward');

    // Tabs the current user can see, in display order — each behind its own gate.
    const visibleTabs: Tab[] = [
        ...(canDashboard ? (['dashboard'] as Tab[]) : []),
        ...(isIT ? (['all'] as Tab[]) : []),
        ...(canJobs ? (['mine'] as Tab[]) : []),
        ...(canMyTickets ? (['my'] as Tab[]) : []),
    ];

    const [searchParams, setSearchParams] = useSearchParams();
    const [tab, setTab] = useState<Tab>(() => initialTicketTab(visibleTabs));
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
    const [catFilter, setCatFilter] = useState<TicketCategory | ''>('');
    const [priFilter, setPriFilter] = useState<TicketPriority | ''>('');
    // '' = all · 'breached' = only tickets whose current SLA deadline has passed.
    const [slaFilter, setSlaFilter] = useState<'' | 'breached'>('');
    const [sort, setSort] = useState(DEFAULT_SORT);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const [range, setRange] = useState<SummaryRange>(30); // dashboard window: 7 / 30 / 90 days or a custom from–to pair

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
    const canEditDetail = !!shownTicket && shownTicket.status === 'open' && shownTicket.requester_id === user?.employee_id;

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

    const { data: summary, isLoading: summaryLoading } = useTicketSummary(canDashboard, range);
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
    const { data: latestData } = useTickets({ page: 1, per_page: 5 }, canDashboard && tab === 'dashboard');
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
    const resetFilters = () => {
        setStatusFilter('');
        setCatFilter('');
        setPriFilter('');
        setSlaFilter('');
        setSort(DEFAULT_SORT);
        setPage(1);
    };

    // Columns for the shared DataTable (All / Assigned-to-me tabs):
    // Request at · Ticket no. · Subject · Request by · Category · Priority · Status · Responsible by
    const columns: Column<Ticket>[] = [
        {
            key: 'created',
            header: t('ticket_request_at'),
            className: 'text-muted-foreground font-mono text-xs',
            render: (tk) => fmtDateTime(tk.created_at),
        },
        { key: 'ticket_no', header: t('ticket_col_no'), className: 'text-muted-foreground font-mono text-xs', render: (tk) => tk.ticket_no },
        {
            key: 'subject',
            header: t('ticket_subject'),
            className: 'font-medium',
            render: (tk) => <span className="block max-w-[280px] truncate">{tk.subject}</span>,
        },
        {
            key: 'requester',
            header: t('ticket_open_by'),
            render: (tk) => tk.requester_name ?? tk.requester_code,
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
        { key: 'sla', header: t('ticket_sla'), render: (tk) => <TicketSlaBadge ticket={tk} t={t} /> },
        {
            key: 'assignee',
            header: t('ticket_responsible_by'),
            render: (tk) => tk.assignee_name ?? <span className="text-muted-foreground italic">{t('ticket_unassigned')}</span>,
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
                    {visibleTabs.map((tb) => (
                        <button
                            key={tb}
                            onClick={() => changeTab(tb)}
                            className={cn(
                                'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                                tab === tb ? 'border-brand text-brand' : 'text-muted-foreground hover:text-foreground border-transparent',
                            )}
                        >
                            {tb === 'dashboard'
                                ? t('ticket_tab_dashboard')
                                : tb === 'all'
                                  ? t('ticket_tab_all')
                                  : tb === 'mine'
                                    ? t('ticket_tab_mine')
                                    : t('ticket_tab_my')}
                            {tb === 'all' && (meta?.open_count ?? 0) > 0 && (
                                // Tickets still waiting for a take: soft red pill (same as the Stock alert badge).
                                <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-red-600 dark:bg-red-950/50 dark:text-red-400">
                                    {(meta?.open_count ?? 0).toLocaleString('en-US')}
                                </span>
                            )}
                            {tb === 'mine' && (meta?.my_jobs_count ?? 0) > 0 && (
                                // My unfinished assignments — same outstanding-work pill.
                                <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-red-600 dark:bg-red-950/50 dark:text-red-400">
                                    {(meta?.my_jobs_count ?? 0).toLocaleString('en-US')}
                                </span>
                            )}
                            {tb === 'my' && (meta?.my_tickets_count ?? 0) > 0 && (
                                // My own requests still unresolved — same outstanding-work pill.
                                <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-red-600 dark:bg-red-950/50 dark:text-red-400">
                                    {(meta?.my_tickets_count ?? 0).toLocaleString('en-US')}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {tab === 'dashboard' && canDashboard && (
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
                            <TicketDashboardBodySkeleton />
                        ) : (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                                    <StatCard
                                        label={t('ticket_kpi_new')}
                                        value={summary?.created ?? 0}
                                        icon={Inbox}
                                        trend={{ delta: summary?.created_delta_count ?? null, suffix: ` ${t('ticket_trend_tickets')}` }}
                                        hint={t('ticket_kpi_vs_prev')}
                                    />
                                    <StatCard
                                        label={t('ticket_kpi_resolved')}
                                        value={summary?.resolved ?? 0}
                                        icon={CheckCircle2}
                                        trend={{
                                            delta: summary?.resolved_delta_count ?? null,
                                            goodUp: true,
                                            suffix: ` ${t('ticket_trend_tickets')}`,
                                        }}
                                        hint={t('ticket_kpi_in_range')}
                                    />
                                    <StatCard
                                        label={t('ticket_kpi_backlog')}
                                        value={summary?.backlog ?? 0}
                                        icon={Layers}
                                        hint={
                                            // Colored per status, matching the Open / In-progress badge tones.
                                            // "Right now" marks this card as a live value — it ignores the range selector.
                                            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                                                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    {(summary?.backlog_open ?? 0).toLocaleString('en-US')} {t('ticket_kpi_waiting')}
                                                </span>
                                                <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
                                                    <RefreshCcw className="h-3.5 w-3.5" />
                                                    {(summary?.backlog_in_progress ?? 0).toLocaleString('en-US')} {t('ticket_kpi_working')}
                                                </span>
                                                <span className="text-muted-foreground/80">· {t('ticket_kpi_now')}</span>
                                            </span>
                                        }
                                    />
                                    <StatCard
                                        label={t('ticket_sla_response_met').replace('{n}', String(summary?.response_target_minutes ?? '—'))}
                                        value={summary?.response_sla_met_pct == null ? '—' : `${summary.response_sla_met_pct}%`}
                                        icon={Zap}
                                        trend={{ delta: summary?.response_sla_delta_pts ?? null, goodUp: true }}
                                    />
                                    <StatCard
                                        label={t('ticket_sla_met')}
                                        value={summary?.sla_met_pct == null ? '—' : `${summary.sla_met_pct}%`}
                                        icon={Gauge}
                                        trend={{ delta: summary?.sla_delta_pts ?? null, goodUp: true }}
                                    />
                                    <StatCard
                                        label={t('ticket_kpi_avg_response')}
                                        value={summary?.avg_response_minutes == null ? '—' : slaDuration(summary.avg_response_minutes, t)}
                                        icon={Timer}
                                        trend={{
                                            delta: summary?.avg_response_delta_minutes ?? null,
                                            goodUp: false,
                                            suffix: ` ${t('ticket_trend_minutes')}`,
                                            upKey: 'ticket_trend_slower',
                                            downKey: 'ticket_trend_faster',
                                        }}
                                    />
                                </div>

                                {/* Card-wrapped sections with an icon header row, mirroring the Access dashboard idiom. */}
                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                    <Card className="overflow-hidden">
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

                                    {/* Right-now status checklist — rows drill into the Tickets tab with the matching filter. */}
                                    <Card className="overflow-hidden">
                                        <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
                                            <div className="flex items-center gap-2">
                                                <Activity className="text-muted-foreground h-4 w-4" />
                                                <span className="text-sm font-semibold">{t('ticket_dash_now_title')}</span>
                                            </div>
                                            <span className="text-muted-foreground flex items-center gap-2 text-xs">
                                                {((summary?.sla_breached_now ?? 0) > 0 || (summary?.backlog_open ?? 0) > 0) && (
                                                    // Blinking dot = something below needs attention (red beats amber).
                                                    <span className="relative flex h-2 w-2">
                                                        <span
                                                            className={cn(
                                                                'absolute inline-flex h-full w-full animate-ping rounded-full motion-reduce:hidden',
                                                                (summary?.sla_breached_now ?? 0) > 0 ? 'bg-destructive/60' : 'bg-amber-500/60',
                                                            )}
                                                        />
                                                        <span
                                                            className={cn(
                                                                'relative inline-flex h-2 w-2 rounded-full',
                                                                (summary?.sla_breached_now ?? 0) > 0 ? 'bg-destructive' : 'bg-amber-500',
                                                            )}
                                                        />
                                                    </span>
                                                )}
                                                {t('ticket_dash_now_hint')}
                                            </span>
                                        </div>
                                        <div className="divide-border/60 divide-y p-2">
                                            {(summary?.sla_breached_now ?? 0) > 0 ? (
                                                <NowRow
                                                    icon={AlertTriangle}
                                                    tone="red"
                                                    title={t('ticket_dash_breached')}
                                                    sub={t('ticket_dash_breached_sub')}
                                                    value={summary?.sla_breached_now ?? 0}
                                                    onClick={() => {
                                                        resetFilters();
                                                        setSlaFilter('breached');
                                                        changeTab('all');
                                                    }}
                                                />
                                            ) : (
                                                <NowRow
                                                    icon={CheckCircle2}
                                                    tone="green"
                                                    title={t('ticket_dash_breached_ok')}
                                                    sub={t('ticket_dash_breached_ok_sub')}
                                                    value="✓"
                                                />
                                            )}
                                            {(summary?.backlog_open ?? 0) > 0 ? (
                                                <NowRow
                                                    icon={Clock}
                                                    tone="amber"
                                                    title={t('ticket_dash_waiting_row')}
                                                    sub={t('ticket_dash_waiting_sub')}
                                                    value={summary?.backlog_open ?? 0}
                                                    onClick={() => {
                                                        resetFilters();
                                                        setStatusFilter('open');
                                                        changeTab('all');
                                                    }}
                                                />
                                            ) : (
                                                <NowRow
                                                    icon={CheckCircle2}
                                                    tone="green"
                                                    title={t('ticket_dash_waiting_ok')}
                                                    sub={t('ticket_dash_waiting_ok_sub')}
                                                    value="✓"
                                                />
                                            )}
                                            <NowRow
                                                icon={RefreshCcw}
                                                tone="ink"
                                                title={t('ticket_dash_working_row')}
                                                sub={t('ticket_dash_working_sub')}
                                                value={summary?.backlog_in_progress ?? 0}
                                                onClick={() => {
                                                    resetFilters();
                                                    setStatusFilter('in_progress');
                                                    changeTab('all');
                                                }}
                                            />
                                        </div>
                                    </Card>
                                </div>

                                <Card className="overflow-hidden">
                                    <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                                        <History className="text-muted-foreground h-4 w-4" />
                                        <span className="text-sm font-semibold">{t('ticket_latest')}</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                resetFilters();
                                                changeTab('all');
                                            }}
                                            className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-0.5 text-xs font-medium transition-colors"
                                        >
                                            {t('ticket_view_all')}
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    <TicketTable rows={latestRows} t={t} onRow={openDetail} compact />
                                </Card>
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
                                                <Gauge className="h-3.5 w-3.5" />
                                                {t('ticket_sla')}
                                            </div>
                                            <SearchableSelect
                                                active={slaFilter !== ''}
                                                value={slaFilter || ALL}
                                                onChange={(v) => {
                                                    setSlaFilter(v === ALL ? '' : 'breached');
                                                    setPage(1);
                                                }}
                                                options={[
                                                    { value: ALL, label: t('ticket_all'), search: t('ticket_all'), icon: <ToneDot tone="gray" /> },
                                                    {
                                                        value: 'breached',
                                                        label: t('ticket_sla_filter_overdue'),
                                                        search: t('ticket_sla_filter_overdue'),
                                                        icon: <ToneDot tone="red" />,
                                                    },
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
            />
            <EditTicketDrawer ticket={editTicket} onClose={() => setEditTicket(null)} />
            <TakeCaseModal ticket={takeTicket} onClose={() => setTakeTicket(null)} />
            <AssignTicketModal ticket={assignTicket} onClose={() => setAssignTicket(null)} />
            <ForwardTicketModal ticket={forwardTicket} onClose={() => setForwardTicket(null)} />
            <ResolveTicketModal ticket={resolveState?.ticket ?? null} mode={resolveState?.mode ?? null} onClose={() => setResolveState(null)} />
        </div>
    );
}

/** Shared ticket table used by both the dashboard preview and the list tabs. */
function TicketTable({ rows, t, onRow, compact }: { rows: Ticket[]; t: (k: string) => string; onRow: (tk: Ticket) => void; compact?: boolean }) {
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
                            {!compact && <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">{fmtDateTime(tk.updated_at, false)}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
