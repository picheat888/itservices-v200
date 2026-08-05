import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { Column, DataTable } from '@/shared/components/data-table';
import { FilterPopover } from '@/shared/components/filter-popover';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge, ToneDot } from '@/shared/components/status-badge';
import { REQUEST_STATUS_META, REQUEST_STATUSES, REQUEST_TYPE_META, REQUEST_TYPES } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ServiceRequest, ServiceRequestStatus, ServiceRequestType } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { useToastStore } from '@/stores/toast';
import { Check, CheckCircle2, ChevronRight, Clock, Download, Eye, History, Inbox, Plus, Search, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DecisionDialog, type DecisionAction } from '../components/decision-dialog';
import { RequestCreateDialog } from '../components/request-create-dialog';
import { RequestDetailDialog } from '../components/request-detail-dialog';
import { WorkflowMini } from '../components/workflow-mini';
import { useRequests } from '../hooks/use-requests';

const TAB_KEY = 'requests.tab';
/** Sentinel for the filters' "all" row — a SearchableSelect option cannot be empty. */
const ALL = '__all__';
type Tab = 'dashboard' | 'all' | 'approvals';

/**
 * Requests page — the whole service-request lifecycle in three tabs:
 * a dashboard (your approval queue + the service catalog + recent activity),
 * the full server-paginated list, and the "awaiting my approval" queue.
 * Deep links: ?add=1 opens the wizard, ?view=<id> opens a request.
 */
export default function RequestsPage() {
    const t = useT();
    const { can } = useAuth();
    const canSubmit = can('requests.submit');

    const [searchParams, setSearchParams] = useSearchParams();

    // Active tab — URL first, then the last choice, then the dashboard.
    const tabParam = searchParams.get('tab') as Tab | null;
    const [tab, setTabState] = useState<Tab>(() => tabParam ?? ((localStorage.getItem(TAB_KEY) as Tab | null) || 'dashboard'));
    useEffect(() => {
        if (tabParam && tabParam !== tab) setTabState(tabParam);
    }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps
    const setTab = (next: Tab) => {
        setTabState(next);
        localStorage.setItem(TAB_KEY, next);
        setSearchParams(
            (p) => {
                const sp = new URLSearchParams(p);
                sp.set('tab', next);
                return sp;
            },
            { replace: true },
        );
    };

    // List controls (all/approvals tabs).
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
        return () => clearTimeout(timer);
    }, [searchInput]);
    // Typed as the unions (plus '' for "all") so the status/type registries can be
    // indexed directly — a raw string would only be checkable at runtime.
    const [status, setStatus] = useState<ServiceRequestStatus | ''>('');
    const [type, setType] = useState<ServiceRequestType | ''>('');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    useEffect(() => setPage(1), [search, status, type, tab]);

    // Main list — powers the table AND the KPI meta (aggregates are filter-independent).
    const listParams =
        tab === 'approvals'
            ? { page, per_page: perPage, search, status, type, scope: 'approvals' as const }
            : tab === 'all'
              ? { page, per_page: perPage, search, status, type }
              : { page: 1, per_page: 6 }; // dashboard: recent activity
    const { data: pageData, isLoading, isFetching } = useRequests(listParams);
    const rows = pageData?.data ?? [];
    const meta = pageData?.meta;

    // Dashboard only: the oldest requests waiting on ME (inline decisions).
    const { data: queueData } = useRequests({ page: 1, per_page: 4, scope: 'approvals' }, tab === 'dashboard');
    const queue = queueData?.data ?? [];

    // Dialogs — create via ?add=1, detail via ?view=<id> (bell deep links land here).
    const adding = searchParams.get('add') === '1';
    const viewId = searchParams.get('view');
    const openCreate = () =>
        setSearchParams(
            (p) => {
                const sp = new URLSearchParams(p);
                sp.set('add', '1');
                return sp;
            },
            { replace: true },
        );
    const closeParam = (key: string) =>
        setSearchParams(
            (p) => {
                const sp = new URLSearchParams(p);
                sp.delete(key);
                return sp;
            },
            { replace: true },
        );
    const openDetail = (r: ServiceRequest) =>
        setSearchParams(
            (p) => {
                const sp = new URLSearchParams(p);
                sp.set('view', String(r.id));
                return sp;
            },
            { replace: true },
        );

    const [decide, setDecide] = useState<{ request: ServiceRequest; action: DecisionAction } | null>(null);

    // Requests older than this many days get the amber age chip (mirrors the mockup).
    const ageDays = (iso: string) => Math.max(0, (Date.now() - new Date(iso.replace(' ', 'T')).getTime()) / 86_400_000);
    const ageLabel = (iso: string) => {
        const d = ageDays(iso);
        return d < 1 ? t('req_age_today') : `${Math.floor(d)}${t('req_age_days')}`;
    };

    const columns: Column<ServiceRequest>[] = [
        {
            key: 'reference',
            header: 'ID',
            render: (r) => <span className="font-mono text-xs font-semibold">{r.reference}</span>,
        },
        {
            key: 'title',
            header: t('req_col_title'),
            render: (r) => {
                const Icon = REQUEST_TYPE_META[r.type].icon;
                return (
                    <div className="flex max-w-[360px] min-w-0 items-center gap-2.5">
                        <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{r.title}</div>
                            {/* The reason, not the service name — the title already says the service. */}
                            <div className="text-muted-foreground truncate text-xs">{r.reason}</div>
                        </div>
                    </div>
                );
            },
        },
        {
            key: 'requester',
            header: t('req_col_requester'),
            render: (r) => (
                <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.requester.name}</div>
                    <div className="text-muted-foreground truncate text-xs">{r.requester.department ?? '—'}</div>
                </div>
            ),
        },
        { key: 'workflow', header: t('req_col_workflow'), render: (r) => <WorkflowMini request={r} /> },
        {
            key: 'status',
            header: t('req_col_status'),
            render: (r) => <StatusBadge tone={REQUEST_STATUS_META[r.status].tone}>{t(REQUEST_STATUS_META[r.status].labelKey)}</StatusBadge>,
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (r) => (
                <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {r.can_approve ? (
                        <>
                            <Button
                                size="sm"
                                className="bg-emerald-600 text-white hover:bg-emerald-700"
                                onClick={() => setDecide({ request: r, action: 'approve' })}
                            >
                                <Check className="h-3.5 w-3.5" />
                                {t('req_approve')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                title={t('req_reject')}
                                onClick={() => setDecide({ request: r, action: 'reject' })}
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </>
                    ) : (
                        <Button size="sm" variant="ghost" onClick={() => openDetail(r)} title={t('wf_view')}>
                            <Eye className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            ),
        },
    ];

    const filterCount = (status ? 1 : 0) + (type ? 1 : 0);

    return (
        <div className="space-y-5">
            {/* Page head */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('requests_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('requests_sub')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => useToastStore.getState().push(t('wf_coming_soon'), 'info', t('export'))}>
                        <Download className="h-4 w-4" />
                        {t('export')}
                    </Button>
                    {canSubmit && (
                        <Button onClick={() => openCreate()}>
                            <Plus className="h-4 w-4" />
                            {t('requests_new')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Tab card */}
            <Card className="overflow-hidden p-0">
                <div className="border-border flex items-center gap-1 border-b px-2">
                    {(
                        [
                            ['dashboard', t('requests_tab_dashboard'), null],
                            ['all', t('requests_tab_all'), meta?.total ?? null],
                            ['approvals', t('requests_tab_approvals'), meta?.awaiting_me ?? null],
                        ] as [Tab, string, number | null][]
                    ).map(([id, label, count]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setTab(id)}
                            className={cn(
                                'relative px-3 py-3 text-sm font-medium transition-colors',
                                tab === id ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {label}
                            {count != null && count > 0 && <span className="text-muted-foreground ml-1.5 font-mono text-xs">{count}</span>}
                            {tab === id && <span className="bg-brand absolute inset-x-3 -bottom-px h-0.5 rounded" />}
                        </button>
                    ))}
                </div>

                {tab === 'dashboard' ? (
                    <div className="space-y-4 p-4">
                        {/* KPI row — each card opens the list it summarises. */}
                        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                            <Kpi
                                icon={Inbox}
                                label={t('req_kpi_awaiting')}
                                value={String(meta?.awaiting_me ?? 0)}
                                onClick={() => setTab('approvals')}
                                sub={`${t('req_kpi_awaiting_of')} ${meta?.pending ?? 0}`}
                            />
                            <Kpi
                                icon={Check}
                                label={t('req_kpi_approved')}
                                value={String((meta?.approved ?? 0) + (meta?.fulfilled ?? 0))}
                                onClick={() => {
                                    setTab('all');
                                    setStatus('approved');
                                }}
                                sub={`${meta?.fulfilled ?? 0} ${t('req_status_fulfilled')}`}
                            />
                            <Kpi
                                icon={X}
                                label={t('req_kpi_rejected')}
                                value={String(meta?.rejected ?? 0)}
                                onClick={() => {
                                    setTab('all');
                                    setStatus('rejected');
                                }}
                                sub={`${meta?.cancelled ?? 0} ${t('req_status_cancelled')}`}
                            />
                            <Kpi
                                icon={Clock}
                                label={t('req_kpi_cycle')}
                                value={meta?.avg_cycle_days != null ? `${meta.avg_cycle_days}${t('req_kpi_days_suffix')}` : '—'}
                                sub={t('req_kpi_cycle_sub')}
                            />
                        </div>

                        {/* Your approval queue — the page's action centre. */}
                        <DashCard
                            icon={Inbox}
                            title={t('req_queue_title')}
                            count={meta?.awaiting_me ?? 0}
                            action={
                                (meta?.awaiting_me ?? 0) > queue.length ? (
                                    <button
                                        type="button"
                                        onClick={() => setTab('approvals')}
                                        className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-0.5 text-xs font-medium transition-colors"
                                    >
                                        {t('req_view_all')}
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </button>
                                ) : undefined
                            }
                        >
                            <div className="divide-border/60 divide-y p-2">
                                {queue.length === 0 ? (
                                    <div className="flex items-start gap-3 px-3 py-2.5">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium">{t('req_queue_empty')}</div>
                                            <div className="text-muted-foreground text-xs">{t('req_queue_empty_sub')}</div>
                                        </div>
                                    </div>
                                ) : (
                                    queue.map((r) => {
                                        const Icon = REQUEST_TYPE_META[r.type].icon;
                                        return (
                                            <div
                                                key={r.id}
                                                onClick={() => openDetail(r)}
                                                className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 transition-colors"
                                            >
                                                <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium">{r.title}</div>
                                                    <div className="text-muted-foreground truncate text-xs">
                                                        {r.requester.name} · {r.requester.department ?? '—'} · {r.reason}
                                                    </div>
                                                </div>
                                                <WorkflowMini request={r} />
                                                <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
                                                    {ageLabel(r.created_at)}
                                                </span>
                                                <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                                                    <Button size="sm" variant="outline" onClick={() => setDecide({ request: r, action: 'approve' })}>
                                                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                        {t('req_approve')}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-muted-foreground hover:text-destructive"
                                                        title={t('req_reject')}
                                                        onClick={() => setDecide({ request: r, action: 'reject' })}
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </DashCard>

                        {/* Recent activity — same row language as the queue, minus the decisions. */}
                        <DashCard
                            icon={History}
                            title={t('req_recent_title')}
                            action={
                                <button
                                    type="button"
                                    onClick={() => setTab('all')}
                                    className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-0.5 text-xs font-medium transition-colors"
                                >
                                    {t('req_view_all')}
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                            }
                        >
                            <div className="divide-border/60 divide-y p-2">
                                {isLoading &&
                                    Array.from({ length: 4 }).map((_, i) => (
                                        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                                            <Skeleton className="h-4 w-4 shrink-0 rounded" />
                                            <div className="min-w-0 flex-1 space-y-1.5">
                                                <Skeleton className="h-3.5 w-1/3" />
                                                <Skeleton className="h-3 w-1/2" />
                                            </div>
                                            <Skeleton className="h-5 w-20 rounded-full" />
                                        </div>
                                    ))}
                                {!isLoading && rows.length === 0 && (
                                    <p className="text-muted-foreground px-3 py-8 text-center text-sm">{t('req_recent_empty')}</p>
                                )}
                                {!isLoading &&
                                    rows.map((r) => {
                                        const Icon = REQUEST_TYPE_META[r.type].icon;
                                        return (
                                            <div
                                                key={r.id}
                                                onClick={() => openDetail(r)}
                                                className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 transition-colors"
                                            >
                                                <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium">{r.title}</div>
                                                    <div className="text-muted-foreground truncate text-xs">
                                                        {r.reference} · {r.requester.name} · {ageLabel(r.created_at)}
                                                    </div>
                                                </div>
                                                {/* The badge already says where this stands, so the progress ticks
                                                    stay in the queue and the table where they drive a decision. */}
                                                <StatusBadge tone={REQUEST_STATUS_META[r.status].tone}>
                                                    {t(REQUEST_STATUS_META[r.status].labelKey)}
                                                </StatusBadge>
                                            </div>
                                        );
                                    })}
                            </div>
                        </DashCard>
                    </div>
                ) : (
                    <div className="p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-2.5">
                            <div className="relative w-full max-w-xs">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    className="h-9 pl-9"
                                    placeholder={t('req_search_ph')}
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                />
                            </div>
                            <FilterPopover
                                count={filterCount}
                                resultCount={meta?.total}
                                onClear={() => {
                                    setStatus('');
                                    setType('');
                                }}
                            >
                                {() => (
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="space-y-1.5">
                                            <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                                                <ToneDot tone={status ? REQUEST_STATUS_META[status].tone : 'gray'} />
                                                {t('req_filter_status')}
                                            </span>
                                            <SearchableSelect
                                                active={!!status}
                                                value={status || ALL}
                                                onChange={(v) => setStatus(v === ALL ? '' : (v as ServiceRequestStatus))}
                                                options={[
                                                    { value: ALL, label: t('all'), search: t('all'), icon: <ToneDot tone="gray" /> },
                                                    ...REQUEST_STATUSES.map((s) => ({
                                                        value: s,
                                                        label: t(REQUEST_STATUS_META[s].labelKey),
                                                        search: t(REQUEST_STATUS_META[s].labelKey),
                                                        icon: <ToneDot tone={REQUEST_STATUS_META[s].tone} />,
                                                    })),
                                                ]}
                                            />
                                        </label>
                                        <label className="space-y-1.5">
                                            <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                                {t('req_filter_type')}
                                            </span>
                                            <SearchableSelect
                                                active={!!type}
                                                value={type || ALL}
                                                onChange={(v) => setType(v === ALL ? '' : (v as ServiceRequestType))}
                                                options={[
                                                    { value: ALL, label: t('all'), search: t('all'), icon: <ToneDot tone="gray" /> },
                                                    ...REQUEST_TYPES.map((k) => {
                                                        const Icon = REQUEST_TYPE_META[k].icon;
                                                        return {
                                                            value: k,
                                                            label: t(REQUEST_TYPE_META[k].labelKey),
                                                            search: t(REQUEST_TYPE_META[k].labelKey),
                                                            icon: <Icon className="text-muted-foreground h-4 w-4" />,
                                                        };
                                                    }),
                                                ]}
                                            />
                                        </label>
                                    </div>
                                )}
                            </FilterPopover>
                        </div>
                        <DataTable
                            columns={columns}
                            rows={rows}
                            rowKey={(r) => r.id}
                            loading={isLoading || isFetching}
                            onRowClick={openDetail}
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

            <RequestCreateDialog open={adding} onClose={() => closeParam('add')} />
            <RequestDetailDialog requestId={viewId ? Number(viewId) : null} onClose={() => closeParam('view')} />
            <DecisionDialog request={decide?.request ?? null} action={decide?.action ?? null} onClose={() => setDecide(null)} />
        </div>
    );
}

/**
 * Card wrapper for one dashboard section: a hairline header row carrying a muted
 * icon, the section name, an optional count, and an optional right-edge action —
 * the same idiom the Ticket overview and Access Directory dashboards use.
 */
function DashCard({
    icon: Icon,
    title,
    count,
    action,
    children,
}: {
    icon: LucideIcon;
    title: string;
    count?: number;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <Card className="overflow-hidden">
            <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                <Icon className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-semibold">{title}</span>
                {count != null && <span className="text-muted-foreground font-mono text-xs">· {count}</span>}
                {action}
            </div>
            {children}
        </Card>
    );
}

function Kpi({
    icon: Icon,
    label,
    value,
    sub,
    onClick,
}: {
    icon: LucideIcon;
    label: string;
    value: string;
    sub: React.ReactNode;
    /** Opens the tab this number summarises. Omit for a read-only metric. */
    onClick?: () => void;
}) {
    return (
        <Card
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && onClick()}
            className={cn('p-5 transition-colors', onClick && 'hover:border-brand/40 cursor-pointer')}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="text-muted-foreground min-w-0 text-sm">{label}</div>
                {/* Brand-tinted tile — follows the theme colour set in Settings, like every other module's stat card. */}
                <span className="bg-brand/10 text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
            <div className="text-muted-foreground mt-1 truncate text-xs">{sub}</div>
        </Card>
    );
}
