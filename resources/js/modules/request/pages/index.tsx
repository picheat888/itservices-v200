import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { Column, DataTable } from '@/shared/components/data-table';
import { FilterPopover } from '@/shared/components/filter-popover';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge, ToneDot } from '@/shared/components/status-badge';
import {
    isOnBehalfRequest,
    onboardingRowClass,
    REQUEST_APPROVE_BUTTON,
    REQUEST_ONBOARDING_BADGE,
    REQUEST_REJECT_BUTTON,
    REQUEST_STATUS_META,
    REQUEST_STATUSES,
    REQUEST_TYPE_META,
    REQUEST_TYPES,
    requestTitle,
} from '@/shared/lib/request-meta';
import { cn, toRecordId } from '@/shared/lib/utils';
import type { ServiceRequest, ServiceRequestStatus, ServiceRequestType } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUiStore } from '@/stores/ui';
import { Check, CheckCircle2, ChevronRight, Clock, Eye, History, Inbox, Plus, Search, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DecisionDialog, type DecisionAction } from '../components/decision-dialog';
import { RequestCreateDialog } from '../components/request-create-dialog';
import { RequestDetailDialog } from '../components/request-detail-dialog';
import { WorkflowMini } from '../components/workflow-mini';
import { useRequests } from '../hooks/use-requests';

/**
 * What last happened to a request, as a sentence: "Approved by X", "Filed by Y". The kind
 * comes from the API as a code so this reads in the language the user is in, and the name
 * is the one frozen on the row that moved.
 *
 * A movement with nobody attached (a request withdrawn by its owner, an older row with no
 * name stored) prints the event alone rather than a dangling "by".
 */
function activityLine(request: ServiceRequest, t: (key: string) => string): string {
    const what = t(`req_activity_${request.activity.kind}`);

    return request.activity.by ? `${what} · ${request.activity.by}` : what;
}

/**
 * The first typed field's value — the one fact that says what a request is actually for
 * (which machine, which mailbox, which share). Only the first: a row identifies and
 * prioritises, and the rest of the specifics are in the dialog where the decision is made.
 */
function headlineValue(request: ServiceRequest, lang: 'en' | 'th'): string {
    const row = request.fields_display[0];

    return lang === 'th' ? row.value_th || row.value : row.value;
}

/** Sentinel for the filters' "all" row — a SearchableSelect option cannot be empty. */
const ALL = '__all__';
/** The tab slugs, which are also what ?tab= carries. */
const TABS = ['dashboard', 'all', 'approvals'] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string | null): v is Tab => TABS.includes(v as Tab);

/**
 * Requests page — the whole service-request lifecycle in three tabs:
 * a dashboard (your approval queue + the service catalog + recent activity),
 * the full server-paginated list, and the "awaiting my approval" queue.
 * Deep links: ?add=1 opens the wizard, ?view=<id> opens a request.
 */
export default function RequestsPage() {
    const t = useT();
    // The queue rows print a stored value in the reader's language (value_th || value).
    const lang = useUiStore((s) => s.lang);
    const { can } = useAuth();
    const canSubmit = can('requests.submit');

    const [searchParams, setSearchParams] = useSearchParams();

    // Active tab lives in the URL and nowhere else, so a reload or a shared link is
    // exact. Validated rather than cast: `?tab=` with a slug this page does not have used
    // to leave the whole card empty, since no branch below matched it.
    const tabParam = searchParams.get('tab');
    const [tab, setTabState] = useState<Tab>(() => (isTab(tabParam) ? tabParam : 'dashboard'));
    useEffect(() => {
        if (isTab(tabParam) && tabParam !== tab) setTabState(tabParam);
    }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps
    // Either list scope means the list tab is the one on screen.
    const isListTab = tab !== 'dashboard';
    const setTab = (next: Tab) => {
        setTabState(next);
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
              : { page: 1, per_page: 6, sort: 'activity' as const }; // dashboard: the activity feed
    const { data: pageData, isLoading, isFetching } = useRequests(listParams);
    const rows = pageData?.data ?? [];
    const meta = pageData?.meta;

    // Dashboard only: the oldest requests waiting on ME (inline decisions).
    const { data: queueData } = useRequests({ page: 1, per_page: 4, scope: 'approvals' }, tab === 'dashboard');
    const queue = queueData?.data ?? [];

    // Dialogs — create via ?add=1, detail via ?view=<id> (bell deep links land here).
    const adding = searchParams.get('add') === '1';
    // Only a real record id opens the dialog. `Number('abc')` is NaN, which still passes
    // an `!= null` check, so a mistyped link used to fetch /service-requests/NaN and sit
    // on the skeleton forever; a malformed link now leaves the list alone.
    const viewId = toRecordId(searchParams.get('view'));
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

    /**
     * Days this request has been waiting on the CURRENT approver — from when their step
     * became current, not from when the request was filed. Null when no step is current
     * (nothing is waiting on anybody) or on rows old enough to predate the timestamp.
     */
    const waitingDays = (r: ServiceRequest): number | null => {
        const since = (r.approvals ?? []).find((a) => a.status === 'current')?.became_current_at;

        return since ? Math.max(0, (Date.now() - new Date(since.replace(' ', 'T')).getTime()) / 86_400_000) : null;
    };
    /**
     * Short enough to sit in a fixed slot: "New" for what arrived today, otherwise the
     * number of days. The full sentence stays as the title, so anybody wondering what the
     * number counts can hover — the card's own heading ("Needs your decision") is the rest
     * of that context.
     */
    /**
     * "New" goes on what reached this approver today; the older rows say nothing at all.
     *
     * A day count read as noise in a column that has to stay narrow, and the queue is
     * ordered oldest-first anyway — so age is carried by the order, and the only thing
     * worth a word is what has just landed.
     */
    const isNewToYou = (r: ServiceRequest): boolean => {
        const days = waitingDays(r);

        return days !== null && days < 1;
    };

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
                            <div className="truncate text-sm font-medium">{requestTitle(r, t)}</div>
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
                    {/* A new hire has no login of their own — say so, or the approver
                        reads it as a colleague asking for a second laptop. */}
                    {isOnBehalfRequest(r) && (
                        <StatusBadge tone={REQUEST_ONBOARDING_BADGE.tone} className="mt-1">
                            {t(REQUEST_ONBOARDING_BADGE.labelKey)}
                        </StatusBadge>
                    )}
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
                            <Button size="sm" className={REQUEST_APPROVE_BUTTON} onClick={() => setDecide({ request: r, action: 'approve' })}>
                                <Check className="h-3.5 w-3.5" />
                                {t('req_approve')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className={REQUEST_REJECT_BUTTON}
                                onClick={() => setDecide({ request: r, action: 'reject' })}
                            >
                                <X className="h-3.5 w-3.5" />
                                {t('req_reject')}
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
                    {/* Two tabs, not three. "Awaiting my approval" was the same table with
                        `scope=approvals` on the query — a filter wearing a tab's clothes, which
                        also split one set of filters into two modes of itself. It is a chip
                        inside the list now; the tab stays lit for either scope. */}
                    {(
                        [
                            ['dashboard', t('requests_tab_dashboard'), null],
                            ['all', t('requests_tab_list'), meta?.total ?? null],
                        ] as [Tab, string, number | null][]
                    ).map(([id, label, count]) => {
                        const active = id === 'dashboard' ? tab === 'dashboard' : isListTab;

                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setTab(id)}
                                className={cn(
                                    'relative px-3 py-3 text-sm font-medium transition-colors',
                                    active ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {label}
                                {count != null && count > 0 && <span className="text-muted-foreground ml-1.5 font-mono text-xs">{count}</span>}
                                {active && <span className="bg-brand absolute inset-x-3 -bottom-px h-0.5 rounded" />}
                            </button>
                        );
                    })}
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
                                                className={cn(
                                                    'hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 transition-colors',
                                                    onboardingRowClass(r),
                                                )}
                                            >
                                                <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    {/* What is being asked for, which the title alone does not say — "Mobile
                                                        device for X" is a tablet or a phone, and an approver reads this row to
                                                        decide which ones to open. The title stands in when a service has no
                                                        typed fields at all (a General Request). */}
                                                    <div className="truncate text-sm font-medium">
                                                        {r.fields_display[0]
                                                            ? `${t(REQUEST_TYPE_META[r.type].labelKey)} · ${headlineValue(r, lang)}`
                                                            : requestTitle(r, t)}
                                                    </div>
                                                    {/* Who it is for. The reason has moved out of the row: it is a sentence, it
                                                        was truncated mid-thought, and it belongs where the decision is made. */}
                                                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                                                        <span className="truncate">
                                                            {r.requester.name}
                                                            {r.requester.department ? ` · ${r.requester.department}` : ''}
                                                        </span>
                                                        {isOnBehalfRequest(r) && (
                                                            <StatusBadge tone={REQUEST_ONBOARDING_BADGE.tone} className="shrink-0">
                                                                {t(REQUEST_ONBOARDING_BADGE.labelKey)}
                                                            </StatusBadge>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* Marks what reached THIS approver today — not what was filed today: a
                                                    four-day-old request can have landed on your desk a minute ago, and the
                                                    age of the request read as a reproach for somebody else's delay.
                                                    
                                                    Ahead of the step track, in a fixed-width slot even when empty: a slot
                                                    that collapsed on the older rows moved the track and the buttons to a
                                                    different x on every line. */}
                                                <span className="flex w-10 shrink-0 justify-end">
                                                    {isNewToYou(r) && (
                                                        <StatusBadge tone="red" dot={false}>
                                                            {t('req_waiting_new')}
                                                        </StatusBadge>
                                                    )}
                                                </span>
                                                <WorkflowMini request={r} />
                                                {/* Only for the person whose decision it is. The card asks the API for
                                                    the steps waiting on you, so every row here should be yours — but a
                                                    card that draws its buttons without checking is how an account with
                                                    no employee record (the administrator) ended up looking at Approve
                                                    on somebody else's step, for the API to refuse on the press. */}
                                                <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        size="sm"
                                                        className={REQUEST_APPROVE_BUTTON}
                                                        disabled={!r.can_approve}
                                                        onClick={() => setDecide({ request: r, action: 'approve' })}
                                                    >
                                                        <Check className="h-3.5 w-3.5" />
                                                        {t('req_approve')}
                                                    </Button>
                                                    {/* Named, not an icon on its own: the destructive action was the quieter
                                                        of the pair, and a bare ✕ beside a labelled button reads as "take this
                                                        off the list" rather than "reject it". */}
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className={REQUEST_REJECT_BUTTON}
                                                        disabled={!r.can_approve}
                                                        onClick={() => setDecide({ request: r, action: 'reject' })}
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                        {t('req_reject')}
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
                                                    <div className="truncate text-sm font-medium">{requestTitle(r, t)}</div>
                                                    <div className="text-muted-foreground truncate text-xs">
                                                        {activityLine(r, t)} · {ageLabel(r.activity.at ?? r.created_at)}
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
                            {/* Reads and writes the same ?tab= as the old tab did, so a shared or
                                bookmarked ?tab=approvals link still lands on this scope. */}
                            <div className="border-border flex h-10 items-center gap-0.5 rounded-md border p-1">
                                {(
                                    [
                                        ['all', t('all'), null],
                                        ['approvals', t('requests_tab_approvals'), meta?.awaiting_me ?? null],
                                    ] as [Tab, string, number | null][]
                                ).map(([id, label, count]) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setTab(id)}
                                        className={cn(
                                            'flex h-full items-center rounded px-2.5 text-xs font-medium transition-colors',
                                            tab === id ? 'bg-brand text-white' : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {label}
                                        {count != null && count > 0 && <span className="ml-1.5 font-mono">{count}</span>}
                                    </button>
                                ))}
                            </div>
                            <div className="relative w-full max-w-xs">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    className="pl-9"
                                    placeholder={t('req_search_ph')}
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                />
                            </div>
                            <FilterPopover
                                count={filterCount}
                                // 460 like every other filter row in the app; the 288 default left the
                                // two-up grid at ~120px a column, which cut every service name short.
                                width={460}
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
                            rowClassName={onboardingRowClass}
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
            <RequestDetailDialog requestId={viewId} onClose={() => closeParam('view')} />
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
