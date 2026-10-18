import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { Column, DataTable } from '@/shared/components/data-table';
import { DateTimeCell } from '@/shared/components/date-time-cell';
import { EmptyState, type EmptyStateProps } from '@/shared/components/empty-state';
import { FilterPopover } from '@/shared/components/filter-popover';
import { LoadFailed, LoadFailedPanel } from '@/shared/components/load-failed';
import { OverviewHeader, overviewPeriodParams, useOverviewPeriod } from '@/shared/components/overview-period';
import { PageTabs } from '@/shared/components/page-tabs';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatCard } from '@/shared/components/stat-card';
import { StatusBadge, ToneDot } from '@/shared/components/status-badge';
import { TruncText } from '@/shared/components/trunc-text';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { usePageDialogs } from '@/shared/hooks/use-page-dialogs';
import { useTabParam } from '@/shared/hooks/use-tab-param';
import { localName, localPair } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
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
import { rowDelay } from '@/shared/lib/row-in';
import { searchLabel } from '@/shared/lib/search-words';
import { CARD_HEADING } from '@/shared/lib/surface';
import { cn, toRecordId } from '@/shared/lib/utils';
import type { ServiceRequest } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUiStore } from '@/stores/ui';
import { CalendarDays, Check, ChevronRight, CircleDot, Clock, Eye, History, Inbox, Layers, Plus, Search, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DecisionDialog, type DecisionAction } from '../components/decision-dialog';
import { FiledDateFilter, type FiledPatch } from '../components/filed-date-filter';
import { RequestCreateDialog } from '../components/request-create-dialog';
import { RequestDetailDialog } from '../components/request-detail-dialog';
import { WorkflowMini } from '../components/workflow-mini';
import { useRequests } from '../hooks/use-requests';
import { canFileAnyRequest } from '../lib/submit-types';

/** What last happened to a request, as a sentence ("Approved by X"); the event alone when nobody is attached. */
function activityLine(request: ServiceRequest, t: (key: string) => string, lang: string): string {
    const what = t(`req_activity_${request.activity.kind}`);

    return request.activity.by
        ? t('req_activity_by')
              .replace('{what}', what)
              .replace('{name}', localPair(request.activity.by, request.activity.by_th, lang) ?? '')
        : what;
}

/** The first typed field's value: what the request is actually for (which machine, which mailbox). */
function headlineValue(request: ServiceRequest, lang: 'en' | 'th'): string {
    const row = request.fields_display[0];

    return localPair(row.value, row.value_th, lang) ?? row.value;
}

/** Sentinel for the filters' "all" row — a SearchableSelect option cannot be empty. */
const ALL = '__all__';
/** The tab slugs, which are also what ?tab= carries. */
const TABS = ['overview', 'all', 'approvals', 'queue'] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string | null): v is Tab => TABS.includes(v as Tab);
/** URL keys of the list, cleared when the overview is entered or left (?per stays). */
const LIST_KEYS = ['search', 'status', 'type', 'filed_days', 'filed_from', 'filed_to', 'page'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A URL value when it is one of `allowed`, else '' (all). */
const pickAllowed = <T extends string>(value: string, allowed: readonly T[]): T | '' =>
    (allowed as readonly string[]).includes(value) ? (value as T) : '';

/** Title of an overview row: a real button whose hit area stretches over the whole row. */
const ROW_BUTTON =
    'block w-full truncate text-left text-sm font-medium after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring';

/** Small label above a filter select (icon + text), matching the other modules' filter panels. */
const fieldLabel = (htmlFor: string, icon: ReactNode, label: string) => (
    <label htmlFor={htmlFor} className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
    </label>
);

/**
 * Requests page: an overview (KPIs, your approval queue, recent activity) and the server-paginated list.
 * Deep links: ?add=1 opens the wizard, ?view=<id> opens a request.
 */
export default function RequestsPage() {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const { can } = useAuth();
    const canSubmit = canFileAnyRequest(can);

    const [searchParams] = useSearchParams();

    // Active tab lives in the URL only (validated); each press is a history entry.
    const [tab, setTab] = useTabParam(isTab, 'overview');
    const isListTab = tab !== 'overview';

    // List search, filters and page live in the URL (?search, status, type, page, per).
    const list = useListParams();
    const { page, perPage } = list;
    const search = list.get('search');
    const sentSearch = useDebouncedSearch(search);
    const status = pickAllowed(list.get('status'), REQUEST_STATUSES);
    const type = pickAllowed(list.get('type'), REQUEST_TYPES);
    // Filed-date filter: ?filed_days=N, or a whole-day ?filed_from&filed_to range
    const filedFrom = ISO_DAY.test(list.get('filed_from')) ? list.get('filed_from') : '';
    const filedTo = ISO_DAY.test(list.get('filed_to')) ? list.get('filed_to') : '';
    const filedRange = filedFrom && filedTo ? { filed_from: filedFrom, filed_to: filedTo } : null;
    const filedDays = !filedRange && Number(list.get('filed_days')) > 0 ? list.get('filed_days') : '';
    const filed = filedRange ?? (filedDays ? { filed_days: filedDays } : {});

    // The box types instantly; the trimmed text reaches ?search 300ms later. `written` tells our own writes from Back / tab clears.
    const [searchInput, setSearchInput] = useState(search);
    const written = useRef(search);
    useEffect(() => {
        if (search === written.current) return;
        written.current = search;
        setSearchInput(search);
    }, [search]);
    useEffect(() => {
        const next = searchInput.trim();
        if (next === search) return;
        const timer = setTimeout(() => {
            written.current = next;
            list.setFilter('search', next);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput, search]); // eslint-disable-line react-hooks/exhaustive-deps

    // Switch tab: leaving or entering the overview clears the list keys (?per stays); All ↔ Approvals keeps them, page 1.
    const switchTab = (next: Tab, filters: Record<string, string> = {}) => {
        if (next === tab) return;
        const keys = tab === 'overview' || next === 'overview' ? LIST_KEYS : ['page'];
        setTab(next, {
            extra: (params) => {
                for (const key of keys) params.delete(key);
                for (const [key, value] of Object.entries(filters)) params.set(key, value);
            },
        });
    };

    // Main list: the table, or on the overview the activity feed; its meta feeds the KPIs.
    const [period, setPeriod] = useOverviewPeriod();
    const listParams =
        tab === 'approvals'
            ? { page, per_page: perPage, search: sentSearch, status, type, ...filed, scope: 'approvals' as const }
            : tab === 'queue'
              ? { page, per_page: perPage, search: sentSearch, status, type, ...filed, scope: 'queue' as const }
              : tab === 'all'
                ? { page, per_page: perPage, search: sentSearch, status, type, ...filed }
                : { page: 1, per_page: 6, sort: 'activity' as const, ...overviewPeriodParams(period) };
    const { data: pageData, isLoading, isFetching, isPlaceholderData, isError, refetch } = useRequests(listParams);
    const rows = pageData?.data ?? [];
    const meta = pageData?.meta;

    // Overview only: the oldest requests waiting on me.
    const {
        data: queueData,
        isLoading: queueLoading,
        isError: queueError,
        refetch: refetchQueue,
    } = useRequests({ page: 1, per_page: 4, scope: 'approvals', sort: 'oldest' }, tab === 'overview');
    const queue = queueData?.data ?? [];

    // Dialogs: create via ?add=1, detail via ?view=<id> (a malformed id leaves the list alone).
    const adding = searchParams.get('add') === '1';
    const viewId = toRecordId(searchParams.get('view'));
    // Opening pushes a history entry so Back closes the dialog
    const dialogs = usePageDialogs();
    const openCreate = () => dialogs.open({ add: '1' });
    const closeParam = (key: string) => dialogs.close([key]);
    const openDetail = (r: ServiceRequest) => dialogs.open({ view: String(r.id) });

    const [decide, setDecide] = useState<{ request: ServiceRequest; action: DecisionAction } | null>(null);

    /** Days the request has waited on the current approver (from when their step became current). */
    const waitingDays = (r: ServiceRequest): number | null => {
        const since = (r.approvals ?? []).find((a) => a.status === 'current')?.became_current_at;

        return since ? Math.max(0, (Date.now() - new Date(since.replace(' ', 'T')).getTime()) / 86_400_000) : null;
    };
    /** "New" marks what reached this approver today; the queue's order carries the age of the rest. */
    const isNewToYou = (r: ServiceRequest): boolean => {
        const days = waitingDays(r);

        return days !== null && days < 1;
    };

    const ageDays = (iso: string) => Math.max(0, (Date.now() - new Date(iso.replace(' ', 'T')).getTime()) / 86_400_000);
    const ageLabel = (iso: string) => {
        const d = ageDays(iso);
        return d < 1 ? t('req_age_today') : `${Math.floor(d)}${t('req_age_days')}`;
    };

    const columns: Column<ServiceRequest>[] = [
        {
            key: 'reference',
            sticky: 'left',
            header: t('dash_col_request'),
            width: '100px',
            className: 'whitespace-nowrap',
            render: (r) => <span className="text-xs font-semibold">{r.reference}</span>,
        },
        {
            key: 'title',
            header: t('req_col_title'),
            minWidth: '14rem',
            render: (r) => {
                const Icon = REQUEST_TYPE_META[r.type].icon;
                return (
                    <div className="flex min-w-0 items-center gap-2.5">
                        <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                            <TruncText text={requestTitle(r, t, lang)} className="text-sm font-medium" />
                            <TruncText text={r.reason} className="text-muted-foreground text-xs" />
                        </div>
                    </div>
                );
            },
        },
        {
            key: 'requester',
            header: t('req_col_requester'),
            width: '180px',
            render: (r) => (
                <div className="min-w-0">
                    <TruncText text={localPair(r.requester.name, r.requester.name_th, lang)} className="text-sm font-medium" />
                    <TruncText text={r.requester.position} className="text-muted-foreground text-xs" />
                    {/* A new hire has no login of their own */}
                    {isOnBehalfRequest(r) && (
                        <StatusBadge tone={REQUEST_ONBOARDING_BADGE.tone} className="mt-1">
                            {t(REQUEST_ONBOARDING_BADGE.labelKey)}
                        </StatusBadge>
                    )}
                </div>
            ),
        },
        {
            key: 'department',
            header: t('req_department'),
            width: '176px',
            render: (r) => <TruncText text={localPair(r.requester.department, r.requester.department_th, lang)} className="text-sm" />,
        },
        {
            key: 'submitted',
            header: t('req_col_submitted'),
            width: '130px',
            className: 'whitespace-nowrap',
            render: (r) => <DateTimeCell value={r.created_at} className="text-muted-foreground" />,
        },
        {
            key: 'workflow',
            header: t('req_col_workflow'),
            width: '140px',
            className: 'whitespace-nowrap',
            render: (r) => <WorkflowMini request={r} />,
        },
        {
            key: 'waiting',
            header: t('req_col_waiting'),
            width: '200px',
            render: (r) =>
                r.status === 'pending' && r.progress.current_label ? (
                    <div className="min-w-0">
                        <TruncText
                            text={localPair(r.progress.current_approver, r.progress.current_approver_th, lang) ?? r.progress.current_label}
                            className="text-sm"
                        />
                        {r.progress.current_approver && <TruncText text={r.progress.current_label} className="text-muted-foreground text-xs" />}
                    </div>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'status',
            header: t('req_col_status'),
            width: '110px',
            className: 'whitespace-nowrap',
            render: (r) => <StatusBadge tone={REQUEST_STATUS_META[r.status].tone}>{t(REQUEST_STATUS_META[r.status].labelKey)}</StatusBadge>,
        },
        {
            key: 'actions',
            sticky: 'right',
            header: <span className="sr-only">{t('actions')}</span>,
            align: 'right',
            // Room for approve and reject only when this page has a request the reader can decide; icon buttons below xl
            width: rows.some((r) => r.can_approve) ? 'clamp(150px, calc(150px + (100vw - 1100px)), 276px)' : '72px',
            render: (r) => (
                <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {r.can_approve && (
                        <>
                            <Button
                                size="sm"
                                className={REQUEST_APPROVE_BUTTON}
                                aria-label={t('req_approve')}
                                title={t('req_approve')}
                                onClick={() => setDecide({ request: r, action: 'approve' })}
                            >
                                <Check className="h-3.5 w-3.5" />
                                <span className="hidden xl:inline">{t('req_approve')}</span>
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className={REQUEST_REJECT_BUTTON}
                                aria-label={t('req_reject')}
                                title={t('req_reject')}
                                onClick={() => setDecide({ request: r, action: 'reject' })}
                            >
                                <X className="h-3.5 w-3.5" />
                                <span className="hidden xl:inline">{t('req_reject')}</span>
                            </Button>
                        </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openDetail(r)} title={t('view')} aria-label={`${t('view')} ${r.reference}`}>
                        <Eye className="h-4 w-4" />
                    </Button>
                </div>
            ),
        },
    ];

    const filterCount = (status ? 1 : 0) + (type ? 1 : 0) + (filedRange || filedDays ? 1 : 0);
    const hasSearchOrFilter = search !== '' || filterCount > 0;
    const listEmpty: EmptyStateProps = hasSearchOrFilter
        ? { kind: 'search', title: t('req_empty_list_all_search'), hint: t('req_empty_list_all_search_hint') }
        : tab === 'approvals'
          ? { title: t('req_empty_list_approvals'), hint: t('req_empty_list_approvals_hint') }
          : tab === 'queue'
            ? { title: t('req_empty_list_queue'), hint: t('req_empty_list_queue_hint') }
            : {
                  title: t('req_empty_list_all'),
                  hint: canSubmit ? t('req_empty_list_all_hint').replace('{button}', t('requests_new')) : null,
              };
    // The overview period carried into the list, so a KPI opens the requests it counted
    const periodFiled: Record<string, string> =
        typeof period === 'number'
            ? { filed_days: String(period) }
            : typeof period === 'object'
              ? { filed_from: period.from, filed_to: period.to }
              : {};
    const visibleTotal = meta ? meta.pending + meta.approved + meta.completed + meta.rejected + meta.cancelled : null;
    const kpiLoading = !meta;
    // What the sidebar badge counts: waiting on me plus, for IT, the approved queue
    const attention = meta ? meta.awaiting_me + meta.to_complete : null;

    return (
        <div className="space-y-6">
            {/* Page head */}
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
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

            {/* Tab card — "awaiting my approval" is a chip inside the list, so the list tab stays lit for both scopes */}
            <Card className="overflow-clip p-0">
                <PageTabs<Tab>
                    tabs={[
                        { id: 'overview', label: t('requests_tab_overview') },
                        { id: 'all', label: t('requests_tab_list'), count: attention },
                    ]}
                    active={isListTab ? 'all' : 'overview'}
                    onChange={(next) => switchTab(next)}
                />

                {tab === 'overview' ? (
                    <div className="space-y-4 p-5">
                        <OverviewHeader value={period} onChange={setPeriod} />
                        {/* KPI row — the awaiting card is as of now, the rest count requests filed in the period */}
                        {isError && !meta ? (
                            <LoadFailedPanel onRetry={() => refetch()} />
                        ) : (
                            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                                <StatCard
                                    icon={Inbox}
                                    label={t('req_kpi_awaiting')}
                                    value={String(meta?.awaiting_me ?? 0)}
                                    onClick={() => switchTab('approvals')}
                                    sub={t('req_kpi_awaiting_of_short').replace('{n}', fmtN(meta?.pending ?? 0))}
                                    footerTitle={t('req_kpi_awaiting_of').replace('{n}', fmtN(meta?.pending ?? 0))}
                                    loading={kpiLoading}
                                />
                                <StatCard
                                    icon={Check}
                                    label={t('req_kpi_approved')}
                                    value={String(meta?.period.approved ?? 0)}
                                    onClick={() => switchTab('all', { status: 'approved', ...periodFiled })}
                                    sub={`${meta?.period.completed ?? 0} ${t('req_status_completed')}`}
                                    loading={kpiLoading}
                                />
                                <StatCard
                                    icon={X}
                                    label={t('req_kpi_rejected')}
                                    value={String(meta?.period.rejected ?? 0)}
                                    onClick={() => switchTab('all', { status: 'rejected', ...periodFiled })}
                                    sub={`${meta?.period.cancelled ?? 0} ${t('req_status_cancelled')}`}
                                    loading={kpiLoading}
                                />
                                <StatCard
                                    icon={Clock}
                                    label={t('req_kpi_cycle')}
                                    value={meta?.period.avg_cycle_days != null ? `${meta.period.avg_cycle_days}${t('req_kpi_days_suffix')}` : '—'}
                                    sub={t('req_kpi_cycle_sub')}
                                    loading={kpiLoading}
                                />
                            </div>
                        )}

                        {/* Your approval queue */}
                        <DashCard
                            icon={Inbox}
                            title={t('req_queue_title')}
                            count={meta?.awaiting_me ?? 0}
                            action={(meta?.awaiting_me ?? 0) > queue.length ? <ViewAllButton onClick={() => switchTab('approvals')} /> : undefined}
                        >
                            <div className="divide-border/60 divide-y p-2">
                                {queueLoading ? (
                                    <RowSkeletons count={2} />
                                ) : queueError && queue.length === 0 ? (
                                    <div className="px-3 py-6 text-center">
                                        <LoadFailed onRetry={() => refetchQueue()} />
                                    </div>
                                ) : queue.length === 0 ? (
                                    <EmptyState kind="clear" title={t('req_empty_overview_queue')} hint={t('req_empty_overview_queue_hint')} />
                                ) : (
                                    queue.map((r, i) => {
                                        const Icon = REQUEST_TYPE_META[r.type].icon;
                                        return (
                                            <div
                                                key={r.id}
                                                className={cn(
                                                    'row-in row-hover relative flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors',
                                                    onboardingRowClass(r),
                                                )}
                                                style={rowDelay(i)}
                                            >
                                                <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    {/* What is asked for; the title when the service has no typed fields */}
                                                    <button type="button" onClick={() => openDetail(r)} className={ROW_BUTTON}>
                                                        {r.fields_display[0]
                                                            ? `${t(REQUEST_TYPE_META[r.type].labelKey)}: ${headlineValue(r, lang)}`
                                                            : requestTitle(r, t, lang)}
                                                    </button>
                                                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                                                        <span className="truncate">{localName(r.requester, lang)}</span>
                                                        {r.requester.department && (
                                                            <span className="truncate">
                                                                {localPair(r.requester.department, r.requester.department_th, lang)}
                                                            </span>
                                                        )}
                                                        {isOnBehalfRequest(r) && (
                                                            <StatusBadge tone={REQUEST_ONBOARDING_BADGE.tone} className="shrink-0">
                                                                {t(REQUEST_ONBOARDING_BADGE.labelKey)}
                                                            </StatusBadge>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* Fixed-width slot so the track and buttons line up on every row */}
                                                <span className="flex w-10 shrink-0 justify-end">
                                                    {isNewToYou(r) && (
                                                        <StatusBadge tone="blue" dot={false}>
                                                            {t('req_waiting_new')}
                                                        </StatusBadge>
                                                    )}
                                                </span>
                                                <WorkflowMini request={r} />
                                                {/* Only the person whose decision it is can press these */}
                                                <div className="relative z-[1] flex shrink-0 gap-1">
                                                    <Button
                                                        size="sm"
                                                        className={REQUEST_APPROVE_BUTTON}
                                                        disabled={!r.can_approve}
                                                        onClick={() => setDecide({ request: r, action: 'approve' })}
                                                    >
                                                        <Check className="h-3.5 w-3.5" />
                                                        {t('req_approve')}
                                                    </Button>
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

                        {/* Recent activity */}
                        <DashCard icon={History} title={t('req_recent_title')} action={<ViewAllButton onClick={() => switchTab('all')} />}>
                            <div className="divide-border/60 divide-y p-2">
                                {isLoading && <RowSkeletons count={4} />}
                                {!isLoading && rows.length === 0 && isError && (
                                    <div className="px-3 py-8 text-center">
                                        <LoadFailed onRetry={() => refetch()} />
                                    </div>
                                )}
                                {!isLoading && rows.length === 0 && !isError && (
                                    <EmptyState
                                        title={t('req_empty_overview_recent')}
                                        hint={canSubmit ? t('req_empty_overview_recent_hint').replace('{button}', t('requests_new')) : null}
                                    />
                                )}
                                {!isLoading &&
                                    rows.map((r, i) => {
                                        const Icon = REQUEST_TYPE_META[r.type].icon;
                                        return (
                                            <div
                                                key={r.id}
                                                className="row-in row-hover relative flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors"
                                                style={rowDelay(i)}
                                            >
                                                <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <button type="button" onClick={() => openDetail(r)} className={ROW_BUTTON}>
                                                        {requestTitle(r, t, lang)}
                                                    </button>
                                                    <div className="text-muted-foreground flex min-w-0 gap-x-3 text-xs">
                                                        <span className="truncate">{activityLine(r, t, lang)}</span>
                                                        <span className="shrink-0">{ageLabel(r.activity.at ?? r.created_at)}</span>
                                                    </div>
                                                </div>
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
                            {/* Scope chips — write the same ?tab= the old tabs did */}
                            <div className="border-border flex h-10 items-center gap-0.5 rounded-md border p-1">
                                {(
                                    [
                                        ['all', t('all'), visibleTotal],
                                        ['approvals', t('requests_tab_approvals'), meta?.awaiting_me ?? null],
                                        ...(can('requests.complete')
                                            ? [['queue', t('requests_tab_queue'), meta?.to_complete ?? null] as [Tab, string, number | null]]
                                            : []),
                                    ] as [Tab, string, number | null][]
                                ).map(([id, label, count]) => (
                                    <button
                                        key={id}
                                        type="button"
                                        aria-pressed={tab === id}
                                        onClick={() => switchTab(id)}
                                        className={cn(
                                            'flex h-full items-center rounded px-2.5 text-xs font-medium transition-colors',
                                            tab === id ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {label}
                                        {count != null && count > 0 && <span className="ml-1.5">{formatNumber(count, lang)}</span>}
                                    </button>
                                ))}
                            </div>
                            <div className="relative w-full max-w-xs">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    className="pl-9 text-ellipsis"
                                    placeholder={t('req_search_ph')}
                                    aria-label={searchLabel(t('req_search_ph'))}
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                            </div>
                            <FilterPopover
                                count={filterCount}
                                width={460}
                                resultCount={meta?.total}
                                onClear={() =>
                                    list.setParams({ status: null, type: null, filed_days: null, filed_from: null, filed_to: null, page: null })
                                }
                            >
                                {() => (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            {fieldLabel(
                                                'req-filter-status',
                                                <CircleDot className="h-3.5 w-3.5" aria-hidden />,
                                                t('req_filter_status'),
                                            )}
                                            <SearchableSelect
                                                id="req-filter-status"
                                                active={!!status}
                                                value={status || ALL}
                                                onChange={(v) => list.setFilter('status', v === ALL ? '' : v)}
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
                                        </div>
                                        <div>
                                            {fieldLabel('req-filter-type', <Layers className="h-3.5 w-3.5" aria-hidden />, t('req_filter_type'))}
                                            <SearchableSelect
                                                id="req-filter-type"
                                                active={!!type}
                                                value={type || ALL}
                                                onChange={(v) => list.setFilter('type', v === ALL ? '' : v)}
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
                                        </div>
                                        <div className="col-span-2">
                                            {fieldLabel(
                                                'req-filter-filed',
                                                <CalendarDays className="h-3.5 w-3.5" aria-hidden />,
                                                t('req_col_submitted'),
                                            )}
                                            <FiledDateFilter
                                                id="req-filter-filed"
                                                value={{ days: filedDays, from: filedFrom, to: filedTo }}
                                                onChange={(patch: FiledPatch) => list.setParams({ ...patch, page: null })}
                                            />
                                        </div>
                                    </div>
                                )}
                            </FilterPopover>
                        </div>
                        <DataTable
                            columns={columns}
                            rows={rows}
                            rowKey={(r) => r.id}
                            loading={isLoading || (isFetching && isPlaceholderData)}
                            onRowClick={openDetail}
                            rowClassName={onboardingRowClass}
                            server={{ ...list.table.paging, total: meta?.total ?? 0 }}
                            emptyState={isError ? <LoadFailed onRetry={() => refetch()} /> : undefined}
                            empty={listEmpty}
                        />
                    </div>
                )}
            </Card>

            <RequestCreateDialog open={adding && canSubmit} onClose={() => closeParam('add')} />
            <RequestDetailDialog requestId={viewId} onClose={() => closeParam('view')} />
            <DecisionDialog request={decide?.request ?? null} action={decide?.action ?? null} onClose={() => setDecide(null)} />
        </div>
    );
}

/** Card for one overview section: icon, name, optional count and a right-edge action. */
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
    action?: ReactNode;
    children: ReactNode;
}) {
    const fmtN = useNumberFormat();
    return (
        <Card className="overflow-hidden">
            <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2 border-b px-5 py-3.5')}>
                <Icon className="text-muted-foreground h-4 w-4" />
                <h2 className="text-sm font-semibold">{title}</h2>
                {count != null && (
                    <span className="bg-muted text-foreground/65 dark:text-muted-foreground rounded-full px-1.5 py-0.5 text-[11px]">
                        {fmtN(count)}
                    </span>
                )}
                {action}
            </div>
            {children}
        </Card>
    );
}

function ViewAllButton({ onClick }: { onClick: () => void }) {
    const t = useT();

    return (
        <button
            type="button"
            onClick={onClick}
            className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-0.5 text-xs font-medium transition-colors [@media(pointer:coarse)]:-my-2 [@media(pointer:coarse)]:py-2"
        >
            {t('req_view_all')}
            <ChevronRight className="h-3.5 w-3.5" />
        </button>
    );
}

/** Pulse rows shaped like the overview list rows. */
function RowSkeletons({ count }: { count: number }) {
    return Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="h-4 w-4 shrink-0 rounded" />
            <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
        </div>
    ));
}
