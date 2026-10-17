import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { useCurrency } from '@/modules/settings';
import { DataTable, type Column } from '@/shared/components/data-table';
import { EmptyState } from '@/shared/components/empty-state';
import { FilterPopover } from '@/shared/components/filter-popover';
import { InfoPopover } from '@/shared/components/info-popover';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import { OverviewHeader } from '@/shared/components/overview-period';
import { PageTabs } from '@/shared/components/page-tabs';
import { RecordMissingDialog } from '@/shared/components/record-missing';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatCard } from '@/shared/components/stat-card';
import { StatusBadge, ToneDot } from '@/shared/components/status-badge';
import { TruncText } from '@/shared/components/trunc-text';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { keepDialogState } from '@/shared/hooks/use-dialog-param';
import { useListParams, usePageInRange } from '@/shared/hooks/use-list-params';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useTabParam } from '@/shared/hooks/use-tab-param';
import { localPair } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { rowDelay } from '@/shared/lib/row-in';
import { searchLabel } from '@/shared/lib/search-words';
import { CARD_HEADING } from '@/shared/lib/surface';
import { cn, toRecordId } from '@/shared/lib/utils';
import type { Contract, ContractStatus, ContractSummary, ContractType } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { useUiStore } from '@/stores/ui';
import {
    AlertOctagon,
    AlertTriangle,
    ArrowRight,
    ArrowUpDown,
    CalendarClock,
    CheckCircle2,
    Clock,
    FileText,
    Filter,
    Plus,
    Search,
    TrendingUp,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ContractDetailDrawer } from '../components/contract-detail-drawer';
import { ContractFormDrawer } from '../components/contract-form-drawer';
import { useContract, useContracts, useContractSummary } from '../hooks/use-contracts';
import { CONTRACT_TYPE_TONE } from '../tones';

// The page's tabs. The active tab is mirrored in the URL (?tab=) so a reload / shared link stays put.
const TAB_IDS = ['overview', 'all'] as const;
type Tab = (typeof TAB_IDS)[number];

const isContractTab = (v: string | null): v is Tab => (TAB_IDS as readonly string[]).includes(v ?? '');

const CONTRACT_TYPES: ContractType[] = ['software', 'hardware', 'service', 'connectivity', 'other'];
type StatusFilter = '' | 'expiring' | 'expired';
const STATUS_FILTERS: StatusFilter[] = ['expiring', 'expired'];
const DEFAULT_SORT = 'end_asc';
const SORT_VALUES = ['end_asc', 'end_desc', 'created_desc', 'created_asc', 'value_desc', 'value_asc'];
// List keys of the All tab; cleared when the tab changes (rows-per-page stays).
const LIST_KEYS = ['search', 'type', 'status', 'sort', 'page'];

/** Days-remaining cell: gray when cancelled/expired, blue far out, amber inside the reminder window, red once overdue. */
function DaysCell({ days, inReminder, status }: { days: number; inReminder: boolean; status: ContractStatus }) {
    const t = useT();
    const fmtN = useNumberFormat();
    if (status === 'cancelled') return <StatusBadge tone="gray">{t('contract_cancelled')}</StatusBadge>;
    if (status === 'expired') return <StatusBadge tone="gray">{t('contract_expired')}</StatusBadge>;
    if (days === 0) return <StatusBadge tone="red">{t('contract_due_today')}</StatusBadge>;
    if (days < 0) return <StatusBadge tone="red">{t('contract_days_overdue_short').replace('{n}', fmtN(-days))}</StatusBadge>;
    if (inReminder) return <StatusBadge tone="amber">{t('contract_days_many').replace('{n}', fmtN(days))}</StatusBadge>;
    return <StatusBadge tone="blue">{t('contract_days_short').replace('{n}', fmtN(days))}</StatusBadge>;
}

export default function ContractsPage() {
    const t = useT();
    const { can } = useAuth();
    const canCreate = can('contracts.create');
    const canEdit = can('contracts.edit');
    const canDelete = can('contracts.delete');
    const canCancel = can('contracts.cancel');
    const canExpire = can('contracts.expire');
    const canReactivate = can('contracts.reactivate');

    // The tab lives in ?tab= (useTabParam): reloads / shared links are exact, Back steps through tabs.
    const [tab, setTab] = useTabParam(isContractTab, 'overview');
    // All-tab search, filters, sort and page live in the URL (?search, type, status, sort, page, per).
    const list = useListParams();
    const { page, perPage } = list;
    const search = list.get('search');
    const sentSearch = useDebouncedSearch(search);
    const ALL_TYPES = '__all__';
    const typeParam = list.get('type');
    const typeFilter: ContractType | '' = CONTRACT_TYPES.includes(typeParam as ContractType) ? (typeParam as ContractType) : '';
    // Status filter: '' = every contract; 'expiring' / 'expired' reuse the backend tab filters.
    const ALL_STATUS = '__all__';
    const statusParam = list.get('status');
    const statusFilter: StatusFilter = STATUS_FILTERS.includes(statusParam as StatusFilter) ? (statusParam as StatusFilter) : '';
    const sortParam = list.get('sort');
    const sort = SORT_VALUES.includes(sortParam) ? sortParam : DEFAULT_SORT;
    // The box updates as typed; ?search follows 350ms after the last key, and takes outside changes (Clear filters)
    const [searchText, setSearchText] = useState(search);
    const writtenSearch = useRef(search);
    useEffect(() => {
        if (search === writtenSearch.current) return;
        writtenSearch.current = search;
        setSearchText(search);
    }, [search]);
    useEffect(() => {
        if (searchText === search) return;
        const id = window.setTimeout(() => {
            writtenSearch.current = searchText;
            list.setFilter('search', searchText);
        }, 350);
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchText, search]);
    const setTypeFilter = (value: ContractType | '') => list.setFilter('type', value);
    const setStatusFilter = (value: StatusFilter) => list.setFilter('status', value);
    const setSort = (value: string) => list.setFilter('sort', value === DEFAULT_SORT ? '' : value);
    // Newly created contract — pinned at the top with a "New" badge for 8 seconds.
    const [newlyCreated, setNewlyCreated] = useState<Contract | null>(null);
    const newlyCreatedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { data: summary, isError: summaryFailed, refetch: refetchSummary } = useContractSummary();
    // The list endpoint's `tab` param doubles as the status filter: '' → all contracts,
    // 'expiring'/'expired' → the matching backend filter.
    const listEnabledTab = statusFilter || 'all';
    const {
        data: listData,
        isLoading,
        isFetching,
    } = useContracts(
        {
            page,
            per_page: perPage,
            search: sentSearch,
            tab: listEnabledTab,
            type: typeFilter || undefined,
            sort,
        },
        tab === 'all',
    );
    // The dialogs live in the URL (?view=<id>, ?edit=1 over it, ?add=1): reloads and shared links reopen them
    const [searchParams, setSearchParams] = useSearchParams();
    const writeDialogs = (change: (p: URLSearchParams) => void) =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                change(p);
                return p;
            },
            { replace: true, state: keepDialogState() },
        );
    // Only a real record id opens the drawer (Number('abc') is NaN)
    const selectedId = toRecordId(searchParams.get('view'));
    const setSelectedId = (id: number | null) =>
        writeDialogs((p) => {
            if (id == null) {
                p.delete('view');
                p.delete('edit');
            } else {
                p.set('view', String(id));
            }
        });
    const { data: selected, isError: selectedMissing } = useContract(selectedId);
    // Edit opens over the view of the same contract, from a copy taken on open so a refetch cannot reset the form
    const editParam = searchParams.get('edit') != null;
    const [editing, setEditing] = useState<Contract | null>(null);
    useEffect(() => {
        if (!editParam) setEditing(null);
        else if (selected && editing?.id !== selected.id) setEditing(selected);
    }, [editParam, selected, editing?.id]);

    const rows = listData?.data ?? [];
    const meta = listData?.meta;
    const totalRows = meta?.total ?? 0;
    usePageInRange(list, meta?.last_page);
    // Below lg (tablet portrait) the start date drops out so the rest keeps room
    const columns = useContractColumns(newlyCreated?.id ?? null);
    const tableRows = newlyCreated ? [newlyCreated, ...rows.filter((r) => r.id !== newlyCreated.id)] : rows;

    // Switch tab and mirror it in the URL (?tab=); the All tab's list keys are cleared in the same write.
    const changeTab = (next: Tab) => {
        if (next === tab) return;
        setTab(next, { extra: (p) => LIST_KEYS.forEach((key) => p.delete(key)) });
    };
    // Open the All tab with a status filter on page 1, as one URL write.
    const showAllWithStatus = (status: StatusFilter) =>
        setTab('all', {
            replace: tab === 'all',
            extra: (p) => {
                if (status) {
                    p.set('status', status);
                } else {
                    p.delete('status');
                }
                p.delete('page');
            },
        });

    const adding = searchParams.get('add') != null;
    const openCreate = () => writeDialogs((p) => p.set('add', '1'));
    const closeForm = () =>
        writeDialogs((p) => {
            p.delete('add');
            p.delete('edit');
        });
    // ?view stays, so closing the form returns to the refreshed detail dialog
    const openEdit = (c: Contract) =>
        writeDialogs((p) => {
            p.set('view', String(c.id));
            p.set('edit', '1');
        });

    /** Called by ContractFormDrawer after a new contract is saved. */
    const handleCreated = (contract: Contract) => {
        // Switch to the "all" tab (with no status filter) and go to page 1 so the user can see the list.
        showAllWithStatus('');
        // Pin the new row at the top for 8 seconds.
        if (newlyCreatedTimer.current) clearTimeout(newlyCreatedTimer.current);
        setNewlyCreated(contract);
        newlyCreatedTimer.current = setTimeout(() => setNewlyCreated(null), 8000);
    };

    const maxVendor = summary?.top_vendors?.[0]?.amount ?? 1;
    // Whether either alert banner is showing — used to tighten the gap (≈10px) above the table.
    const hasBanners = !!summary?.expiring || !!summary?.overdue;

    // Set filters (type/status/sort ≠ default) — drives the FilterPopover count badge.
    const activeFilterCount = (typeFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (sort !== DEFAULT_SORT ? 1 : 0);
    // True when any list control differs from its default — drives the quick "Clear filters" pill.
    const hasActiveFilters = !!search || activeFilterCount > 0;

    /** Reset search, type/status filters and sort back to their defaults. */
    const clearFilters = () => list.setParams({ search: null, type: null, status: null, sort: null, page: null });

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('contracts_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('contracts_sub')}</p>
                </div>
                <div className="flex gap-2">
                    {canCreate && (
                        <Button onClick={openCreate}>
                            <Plus className="h-4 w-4" />
                            {t('new_contract')}
                        </Button>
                    )}
                </div>
            </div>

            {hasBanners && (
                <div className="mb-2.5 space-y-2.5">
                    {!!summary?.expiring && (
                        <div className="rounded-md bg-amber-50 p-4 dark:bg-amber-500/10">
                            <div className="flex">
                                <div className="shrink-0">
                                    <AlertTriangle className={cn(BANNER_BLINK, 'h-5 w-5 text-amber-500 dark:text-amber-400')} aria-hidden />
                                </div>
                                <div className="ml-3 flex-1 md:flex md:items-center md:justify-between">
                                    <p className="text-foreground text-sm font-medium">
                                        {t(summary.expiring === 1 ? 'contract_banner_expiring_one' : 'contract_banner_expiring_many').replace(
                                            '{n}',
                                            String(summary.expiring),
                                        )}
                                    </p>
                                    <p className="mt-3 text-sm md:mt-0 md:ml-6">
                                        <button
                                            type="button"
                                            onClick={() => showAllWithStatus('expiring')}
                                            className="inline-flex min-h-6 items-center gap-1 font-medium whitespace-nowrap text-amber-800 hover:text-amber-600 dark:text-amber-300 dark:hover:text-amber-200"
                                        >
                                            {t('contract_label_review')}
                                            <span aria-hidden="true">→</span>
                                        </button>
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {!!summary?.overdue && (
                        <div className="rounded-md bg-red-50 p-4 dark:bg-red-500/10">
                            <div className="flex">
                                <div className="shrink-0">
                                    <AlertOctagon className={cn(BANNER_BLINK, 'h-5 w-5 text-red-500 dark:text-red-400')} aria-hidden />
                                </div>
                                <div className="ml-3 flex-1 md:flex md:items-center md:justify-between">
                                    <p className="text-foreground text-sm font-medium">
                                        {t(summary.overdue === 1 ? 'contract_banner_overdue_one' : 'contract_banner_overdue_many').replace(
                                            '{n}',
                                            String(summary.overdue),
                                        )}
                                    </p>
                                    <p className="mt-3 text-sm md:mt-0 md:ml-6">
                                        <button
                                            type="button"
                                            onClick={() => showAllWithStatus('expired')}
                                            className="inline-flex min-h-6 items-center gap-1 font-medium whitespace-nowrap text-red-800 hover:text-red-600 dark:text-red-300 dark:hover:text-red-200"
                                        >
                                            {t('contract_label_review')}
                                            <span aria-hidden="true">→</span>
                                        </button>
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <Card className="overflow-clip">
                <PageTabs<Tab>
                    tabs={[
                        { id: 'overview', label: t('sub_overview') },
                        { id: 'all', label: t('all_contracts') },
                    ]}
                    active={tab}
                    onChange={changeTab}
                />

                {tab === 'overview' ? (
                    !summary && summaryFailed ? (
                        <LoadFailedPanel onRetry={() => refetchSummary()} />
                    ) : (
                        <OverviewTab summary={summary} maxVendor={maxVendor} onSelect={setSelectedId} />
                    )
                ) : (
                    <div className="space-y-3 p-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative w-full max-w-xs">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    type="search"
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                    placeholder={t('contract_search')}
                                    aria-label={searchLabel(t('contract_search'))}
                                    className="pl-9 text-ellipsis"
                                />
                            </div>
                            <FilterPopover count={activeFilterCount} width={460} onClear={clearFilters} resultCount={totalRows}>
                                {() => {
                                    const sortOptions = [
                                        { value: 'end_asc', label: t('contract_sort_end_asc') },
                                        { value: 'end_desc', label: t('contract_sort_end_desc') },
                                        { value: 'created_desc', label: t('contract_sort_created_desc') },
                                        { value: 'created_asc', label: t('contract_sort_created_asc') },
                                        { value: 'value_desc', label: t('contract_sort_value_desc') },
                                        { value: 'value_asc', label: t('contract_sort_value_asc') },
                                    ];
                                    return (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                    <Filter className="h-3.5 w-3.5" />
                                                    {t('contract_label_type')}
                                                </div>
                                                <SearchableSelect
                                                    active={!!typeFilter}
                                                    value={typeFilter || ALL_TYPES}
                                                    onChange={(v) => setTypeFilter(v === ALL_TYPES ? '' : (v as ContractType))}
                                                    options={[
                                                        {
                                                            value: ALL_TYPES,
                                                            label: t('contract_filter_all_types'),
                                                            search: t('contract_filter_all_types'),
                                                            icon: <ToneDot tone="gray" />,
                                                        },
                                                        {
                                                            value: 'software',
                                                            label: t('contract_type_software'),
                                                            search: t('contract_type_software'),
                                                            icon: <ToneDot tone="blue" />,
                                                        },
                                                        {
                                                            value: 'hardware',
                                                            label: t('contract_type_hardware'),
                                                            search: t('contract_type_hardware'),
                                                            icon: <ToneDot tone="violet" />,
                                                        },
                                                        {
                                                            value: 'service',
                                                            label: t('contract_type_service'),
                                                            search: t('contract_type_service'),
                                                            icon: <ToneDot tone="amber" />,
                                                        },
                                                        {
                                                            value: 'connectivity',
                                                            label: t('contract_type_connectivity'),
                                                            search: t('contract_type_connectivity'),
                                                            icon: <ToneDot tone="green" />,
                                                        },
                                                        {
                                                            value: 'other',
                                                            label: t('contract_type_other'),
                                                            search: t('contract_type_other'),
                                                            icon: <ToneDot tone="gray" />,
                                                        },
                                                    ]}
                                                />
                                            </div>
                                            <div>
                                                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    {t('contract_label_status')}
                                                </div>
                                                <SearchableSelect
                                                    active={!!statusFilter}
                                                    value={statusFilter || ALL_STATUS}
                                                    onChange={(v) => setStatusFilter(v === ALL_STATUS ? '' : (v as StatusFilter))}
                                                    options={[
                                                        {
                                                            value: ALL_STATUS,
                                                            label: t('contract_filter_all_statuses'),
                                                            search: t('contract_filter_all_statuses'),
                                                            icon: <ToneDot tone="gray" />,
                                                        },
                                                        {
                                                            value: 'expiring',
                                                            label: t('expiring_soon'),
                                                            search: t('expiring_soon'),
                                                            icon: <ToneDot tone="amber" />,
                                                        },
                                                        {
                                                            value: 'expired',
                                                            label: t('expired_contracts'),
                                                            search: t('expired_contracts'),
                                                            icon: <ToneDot tone="red" />,
                                                        },
                                                    ]}
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                    <ArrowUpDown className="h-3.5 w-3.5" />
                                                    {t('contract_filter_sort')}
                                                </div>
                                                <SearchableSelect
                                                    active={sort !== DEFAULT_SORT}
                                                    value={sort}
                                                    onChange={setSort}
                                                    options={sortOptions.map((o) => ({ ...o, search: o.label }))}
                                                />
                                            </div>
                                        </div>
                                    );
                                }}
                            </FilterPopover>
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="border-border text-muted-foreground hover:bg-accent hover:text-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                                >
                                    <X className="h-3 w-3" />
                                    {t('reset_filters')}
                                </button>
                            )}
                        </div>

                        <DataTable
                            columns={columns}
                            rows={tableRows}
                            rowKey={(c) => c.id}
                            onRowClick={(c) => setSelectedId(c.id)}
                            rowClassName={(c) => (c.id === newlyCreated?.id ? NEW_ROW : undefined)}
                            loading={isLoading || isFetching}
                            loadingRows={rows.length || 8}
                            caption={t('contracts_title')}
                            empty={
                                hasActiveFilters
                                    ? { kind: 'search', title: t('contract_empty_list_search'), hint: t('contract_empty_list_search_hint') }
                                    : {
                                          kind: 'empty',
                                          title: t('contract_empty_list'),
                                          hint: canCreate ? t('contract_empty_list_hint').replace('{button}', t('new_contract')) : null,
                                      }
                            }
                            server={{ ...list.table.paging, total: totalRows }}
                        />
                    </div>
                )}
            </Card>

            {/* The drawer bails out on a null record, so a dead ?view= link had nothing to
                render and said nothing. This says it instead. */}
            <RecordMissingDialog open={selectedMissing} onClose={() => setSelectedId(null)} />
            <ContractDetailDrawer
                contract={selected ?? null}
                onClose={() => setSelectedId(null)}
                onEdit={openEdit}
                canEdit={canEdit}
                canCancel={canCancel}
                canExpire={canExpire}
                canReactivate={canReactivate}
                canDelete={canDelete}
            />
            <ContractFormDrawer open={adding || editing != null} editing={adding ? null : editing} onClose={closeForm} onCreated={handleCreated} />
        </div>
    );
}

/** Hover / tap note on a timeline dot: what the contract is, when it ends, and a way in. */
function TimelineDotNote({ dot, onOpen }: { dot: ContractSummary['timeline'][number]; onOpen: () => void }) {
    const t = useT();
    const fmt = useDateFormat();
    const lang = useUiStore((s) => s.lang);
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-[11px]">{dot.code}</span>
                <DaysCell days={dot.days} inReminder={dot.in_reminder} status={dot.days <= 0 ? 'overdue' : 'active'} />
            </div>
            <div className="line-clamp-2 text-[13px] leading-snug font-semibold">{dot.name}</div>
            {dot.vendor && <div className="text-muted-foreground truncate">{localPair(dot.vendor, dot.vendor_th, lang)}</div>}
            <div className="border-border flex items-center justify-between gap-2 border-t pt-1.5">
                <span>{t('contract_timeline_ends').replace('{date}', fmt.date(dot.end))}</span>
                <button type="button" onClick={onOpen} className="text-brand-ink inline-flex min-h-6 items-center gap-1 font-medium hover:underline">
                    {t('contract_timeline_open')}
                    <ArrowRight className="h-3 w-3" aria-hidden />
                </button>
            </div>
        </div>
    );
}

const NEW_ROW = 'animate-in fade-in bg-emerald-500/8 duration-500 hover:bg-emerald-500/12';

/** Columns of the All-tab table; the pinned new contract carries a "New" badge. */
function useContractColumns(newId: number | null): Column<Contract>[] {
    const t = useT();
    const fmt = useDateFormat();
    const lang = useUiStore((s) => s.lang);
    return [
        {
            key: 'code',
            sticky: 'left',
            header: t('contract_code'),
            width: '150px',
            className: 'whitespace-nowrap',
            render: (c) => (
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">{c.code}</span>
                    {c.id === newId && <StatusBadge tone="green">{t('contract_badge_new')}</StatusBadge>}
                </div>
            ),
        },
        {
            key: 'name',
            header: t('contract_name'),
            minWidth: '16rem',
            render: (c) => (
                <div className="min-w-0">
                    <TruncText text={c.name} className="font-medium" />
                    <TruncText text={c.details} className="text-muted-foreground text-xs" />
                </div>
            ),
        },
        {
            key: 'vendor',
            header: t('contract_vendor'),
            width: '260px',
            render: (c) => <TruncText text={localPair(c.vendor, c.vendor_th, lang)} />,
        },
        {
            key: 'type',
            header: t('contract_type'),
            width: '130px',
            className: 'whitespace-nowrap',
            render: (c) => <StatusBadge tone={CONTRACT_TYPE_TONE[c.type]}>{t(`contract_type_${c.type}`)}</StatusBadge>,
        },
        { key: 'start', header: t('contract_start'), width: '110px', className: 'whitespace-nowrap text-xs', render: (c) => fmt.date(c.start) },
        { key: 'end', header: t('contract_end'), width: '110px', className: 'whitespace-nowrap text-xs', render: (c) => fmt.date(c.end) },
        {
            key: 'days',
            header: t('contract_days_remaining'),
            width: '160px',
            className: 'whitespace-nowrap',
            render: (c) => <DaysCell days={c.days_remaining} inReminder={c.in_reminder} status={c.status} />,
        },
        { key: 'value', header: t('contract_value'), width: '140px', className: 'whitespace-nowrap text-xs', render: (c) => c.value_display },
        {
            key: 'total',
            header: t('contract_total_value'),
            width: '140px',
            className: 'whitespace-nowrap text-xs',
            render: (c) => c.total_value_display ?? '—',
        },
        {
            key: 'assets',
            header: t('contract_link_assets'),
            align: 'right',
            width: '110px',
            className: 'whitespace-nowrap text-xs tabular-nums',
            render: (c) => formatNumber(c.assets_count ?? 0, lang),
        },
        {
            key: 'status',
            header: t('status'),
            width: '120px',
            className: 'whitespace-nowrap',
            render: (c) => <ContractStatusBadge status={c.status} days={c.days_remaining} />,
        },
    ];
}

function ContractStatusBadge({ status, days }: { status: ContractStatus; days: number }) {
    const t = useT();
    if (status === 'cancelled') return <StatusBadge tone="gray">{t('contract_cancelled')}</StatusBadge>;
    if (status === 'expired') return <StatusBadge tone="gray">{t('contract_expired')}</StatusBadge>;
    if (status === 'overdue') return <StatusBadge tone="red">{t(days === 0 ? 'contract_due_today' : 'contract_overdue')}</StatusBadge>;
    return <StatusBadge tone="green">{t('contract_active')}</StatusBadge>;
}

/** Alert-banner icons pulse three times on arrival (4.2s, under WCAG 2.2.2's 5s), not forever. */
const BANNER_BLINK = 'motion-safe:animate-[pulse_1.4s_ease-in-out_3]';

function OverviewTab({
    summary,
    maxVendor,
    onSelect,
}: {
    summary: ReturnType<typeof useContractSummary>['data'];
    maxVendor: number;
    onSelect: (id: number) => void;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const fmt = useDateFormat();
    const { formatCompact } = useCurrency();
    const lang = useUiStore((s) => s.lang);

    // Loading state mirrors the real layout with pulsing placeholders (same feel as the Stock dashboard).
    if (!summary)
        return (
            <div className="space-y-4 p-5">
                <OverviewHeader />
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i} className="p-5">
                            <div className="flex items-start justify-between">
                                <div className="bg-muted h-4 w-24 animate-pulse rounded" />
                                <div className="bg-muted h-9 w-9 animate-pulse rounded-lg" />
                            </div>
                            <div className="bg-muted mt-3 h-8 w-20 animate-pulse rounded" />
                        </Card>
                    ))}
                </div>
                <div className="bg-muted/40 h-36 animate-pulse rounded-lg" />
                <div className="grid gap-4 lg:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <Card key={i} className="overflow-hidden">
                            <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2 border-b px-5 py-3.5')}>
                                <div className="bg-muted h-4 w-4 animate-pulse rounded" />
                                <div className="bg-muted h-4 w-36 animate-pulse rounded" />
                            </div>
                            <div className="space-y-3 p-5">
                                {Array.from({ length: 5 }).map((_, r) => (
                                    <div key={r} className="bg-muted h-9 w-full animate-pulse rounded" />
                                ))}
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        );

    // 12-month window starting 2 months back, so the current month (NOW) sits in
    // the third column and recently-expired contracts stay visible to its left.
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
        const offset = i - 2;
        const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        return {
            key: `${d.getFullYear()}-${d.getMonth()}`,
            label: fmt.month(d),
            year: fmt.year(d.getFullYear()),
            isNow: offset === 0,
        };
    });

    // Each dot sits at its expiry day; near neighbours stack into lanes
    const points = summary.timeline
        .flatMap((c) => {
            const [y, mo, day] = c.end.split('-').map(Number);
            const idx = months.findIndex((m) => m.key === `${y}-${mo - 1}`);
            // Off the axis: no column to stand in
            if (idx === -1) return [];
            const daysInMonth = new Date(y, mo, 0).getDate();
            const within = Math.min(0.95, Math.max(0.05, (day - 0.5) / daysInMonth));
            return [{ c, frac: (idx + within) / 12 }];
        })
        .sort((a, b) => a.frac - b.frac);

    const MIN_GAP = 0.03; // dots closer than 3% of the axis get pushed to a new lane
    const laneLastFrac: number[] = [];
    const placed = points.map((p) => {
        let lane = 0;
        while (lane < laneLastFrac.length && p.frac - laneLastFrac[lane] < MIN_GAP) {
            lane++;
        }
        laneLastFrac[lane] = p.frac;
        return { ...p, lane };
    });
    const laneCount = Math.max(1, laneLastFrac.length);
    const plotHeight = Math.max(64, laneCount * 16 + 16);

    return (
        <div className="space-y-4 p-5">
            <OverviewHeader />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label={t('contract_total')} value={String(summary.total)} sub={null} icon={FileText} />
                <StatCard label={t('contract_active_normal')} value={String(summary.active)} sub={null} icon={CheckCircle2} />
                <StatCard
                    label={t('expiring_soon')}
                    value={String(summary.expiring)}
                    sub={<span className="text-amber-700 dark:text-amber-400">{t('contract_hint_in_reminder')}</span>}
                    icon={Clock}
                />
                <StatCard
                    label={t('contract_annual_value')}
                    value={String(summary.annual_value)}
                    sub={t('contract_hint_excl_cancelled')}
                    icon={TrendingUp}
                />
            </div>

            {/* Expiry timeline — 12 months, starting 2 months back with NOW in the third column */}
            <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                        <CalendarClock className="text-muted-foreground h-4 w-4" />
                        {t('contract_timeline')}
                    </span>
                    <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
                        <span className="flex items-center gap-1.5">
                            <span className="bg-brand h-2 w-2 rounded-full" />
                            {t('contract_timeline_upcoming')}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-amber-600 dark:bg-amber-500" />
                            {t('contract_timeline_in_reminder')}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="bg-destructive h-2 w-2 rounded-full" />
                            {t('contract_timeline_overdue')}
                        </span>
                    </div>
                </div>

                {summary.timeline.length === 0 ? (
                    <EmptyState
                        kind="empty"
                        title={t('contract_empty_overview_timeline')}
                        hint={t('contract_empty_overview_timeline_hint')}
                        className="bg-muted/50 rounded-md"
                    />
                ) : (
                    <div className="bg-muted/40 relative overflow-hidden rounded-lg">
                        {/* Full-height NOW column highlight, sitting behind the dots and labels */}
                        <div className="pointer-events-none absolute inset-0 grid grid-cols-12 px-2">
                            {months.map((m) => (
                                <div key={m.key} className={m.isNow ? 'bg-brand/10' : ''} />
                            ))}
                        </div>
                        <div className="relative z-10 mx-2 mt-3" style={{ height: `${plotHeight}px` }}>
                            {/* Month separators */}
                            {months.slice(1).map((m, i) => (
                                <div
                                    key={m.key}
                                    className="border-border/40 absolute inset-y-0 border-l"
                                    style={{ left: `${((i + 1) / 12) * 100}%` }}
                                />
                            ))}
                            {/* Axis baseline */}
                            <div className="border-border absolute inset-x-0 bottom-0 border-t" />
                            {/* Contract dots, positioned by actual expiry date */}
                            {placed.map(({ c, frac, lane }) => {
                                const when =
                                    c.days === 0
                                        ? t('contract_due_today')
                                        : c.days < 0
                                          ? t('contract_timeline_expired_ago').replace('{n}', fmtN(-c.days))
                                          : t('contract_days_many').replace('{n}', fmtN(c.days));
                                return (
                                    <InfoPopover
                                        key={c.id}
                                        label={`${c.code} ${c.name}, ${fmt.date(c.end)} (${when})`}
                                        content={(close) => (
                                            <TimelineDotNote
                                                dot={c}
                                                onOpen={() => {
                                                    close();
                                                    onSelect(c.id);
                                                }}
                                            />
                                        )}
                                        onActivate={() => onSelect(c.id)}
                                        contentClassName="w-64"
                                        className={cn(
                                            // A 24px hit area around the 12px dot (WCAG 2.5.8)
                                            'ring-background focus-visible:outline-ring absolute h-3 w-3 -translate-x-1/2 cursor-pointer rounded-full ring-2 transition-transform before:absolute before:-inset-1.5 before:content-[""] hover:z-10 hover:scale-125 focus-visible:z-10 data-[state=open]:z-10 data-[state=open]:scale-125',
                                            c.days <= 0 ? 'bg-destructive' : c.in_reminder ? 'bg-amber-600 dark:bg-amber-500' : 'bg-brand',
                                        )}
                                        style={{ left: `${frac * 100}%`, bottom: `${8 + lane * 16}px` }}
                                    >
                                        {null}
                                    </InfoPopover>
                                );
                            })}
                        </div>
                        <div className="relative z-10 mt-1 grid grid-cols-12 px-2 py-1.5">
                            {months.map((m) => (
                                <div key={m.key} className="text-center leading-tight">
                                    {m.isNow && (
                                        <div className="text-brand-ink text-[9px] font-bold tracking-wide uppercase">
                                            {t('contract_timeline_now')}
                                        </div>
                                    )}
                                    <div className={cn('text-[11px] font-medium', m.isNow ? 'text-brand-ink font-bold' : 'text-foreground')}>
                                        {m.label}
                                    </div>
                                    <div className={cn('text-[10px]', m.isNow ? 'text-brand-ink' : 'text-muted-foreground')}>{m.year}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {/* Top vendors by spend */}
                <Card className="overflow-hidden">
                    <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2 border-b px-5 py-3.5')}>
                        <TrendingUp className="text-muted-foreground h-4 w-4" />
                        <span className="text-sm font-semibold">{t('contract_top_vendors')}</span>
                    </div>
                    <div className="space-y-2.5 p-5">
                        {summary.top_vendors.map((r, i) => (
                            <div key={r.vendor} className="row-in" style={rowDelay(i)}>
                                <div className="mb-1 flex justify-between text-sm">
                                    <span>{localPair(r.vendor, r.vendor_th, lang)}</span>
                                    <span className="text-muted-foreground text-xs">{formatCompact(r.amount)}</span>
                                </div>
                                <div className="bg-muted h-2 overflow-hidden rounded-full">
                                    <span
                                        className="bg-brand block h-full rounded-full"
                                        style={{ width: `${maxVendor > 0 ? (r.amount / maxVendor) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Action queue */}
                <Card className="overflow-hidden">
                    <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2 border-b px-5 py-3.5')}>
                        <AlertTriangle className="text-muted-foreground h-4 w-4" />
                        <span className="text-sm font-semibold">{t('contract_action_queue')}</span>
                    </div>
                    {/* Up to 20 items (server-capped); scroll within the card so a long queue
                        doesn't stretch the layout past the Top-vendors card beside it. */}
                    <div className="divide-border/60 max-h-96 divide-y overflow-y-auto p-2">
                        {summary.action_queue.length === 0 && (
                            <EmptyState
                                kind="clear"
                                title={t('contract_empty_overview_action_queue')}
                                hint={t('contract_empty_overview_action_queue_hint')}
                            />
                        )}
                        {summary.action_queue.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => onSelect(c.id)}
                                className="hover:bg-accent/40 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
                            >
                                <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-xs font-bold whitespace-nowrap text-amber-700 dark:text-amber-400">
                                    {t('contract_days_short').replace('{n}', fmtN(c.days))}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{c.name}</div>
                                    <div className="text-muted-foreground text-xs">{localPair(c.vendor, c.vendor_th, lang)}</div>
                                </div>
                                <ArrowRight className="text-muted-foreground h-4 w-4" />
                            </button>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}
