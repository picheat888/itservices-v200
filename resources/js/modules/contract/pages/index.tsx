import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { useCurrency } from '@/modules/settings';
import { FilterPopover } from '@/shared/components/filter-popover';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge, ToneDot } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import type { Contract, ContractStatus, ContractType, Role } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useUiStore } from '@/stores/ui';
import {
    AlertOctagon,
    AlertTriangle,
    ArrowRight,
    ArrowUpDown,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    FileText,
    Filter,
    Import,
    Plus,
    Search,
    TrendingUp,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ContractDetailDrawer } from '../components/contract-detail-drawer';
import { ContractFormDrawer } from '../components/contract-form-drawer';
import { ImportContractDialog } from '../components/import-contract-dialog';
import { useContract, useContracts, useContractSummary } from '../hooks/use-contracts';

// The page's tabs. The active tab is mirrored in the URL (?tab=) so a reload / shared link stays put,
// and also remembered in localStorage so navigating away and back (which resets the URL) restores it.
const TAB_IDS = ['dashboard', 'all'] as const;
type Tab = (typeof TAB_IDS)[number];

// localStorage key for the last-active tab — the fallback when the URL has no ?tab=
// (e.g. landing on /contracts from the sidebar menu rather than a reload/shared link).
const CONTRACT_TAB_KEY = 'contracts.tab';
const isContractTab = (v: string | null): v is Tab => (TAB_IDS as readonly string[]).includes(v ?? '');

/** Resolve the starting tab: URL (?tab=) wins, then the last tab in localStorage, then the dashboard. */
function initialContractTab(): Tab {
    const fromUrl = new URLSearchParams(window.location.search).get('tab');
    if (isContractTab(fromUrl)) {
        return fromUrl;
    }
    const fromStore = localStorage.getItem(CONTRACT_TAB_KEY);
    return isContractTab(fromStore) ? fromStore : 'dashboard';
}

function StatCard({
    label,
    value,
    hint,
    hintDanger,
    icon: Icon,
}: {
    label: string;
    value: string | number;
    hint?: string;
    hintDanger?: boolean;
    icon: typeof FileText;
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
            {hint && <div className={cn('mt-1 text-xs', hintDanger ? 'text-red-500' : 'text-muted-foreground')}>{hint}</div>}
        </Card>
    );
}

/** Days-remaining cell: gray when cancelled, blue far out, amber inside the reminder window, red once expired. */
function DaysCell({ days, inReminder, status }: { days: number; inReminder: boolean; status: ContractStatus }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (status === 'cancelled') return <StatusBadge tone="gray">{t('contract_cancelled')}</StatusBadge>;
    if (days <= 0) return <StatusBadge tone="red">{lang === 'th' ? `หมดอายุไป ${-days} วัน` : `Expired ${-days}d ago`}</StatusBadge>;
    if (inReminder)
        return (
            <StatusBadge tone="amber">
                {days} {lang === 'th' ? 'วัน' : 'days'}
            </StatusBadge>
        );
    return <StatusBadge tone="blue">{days}d</StatusBadge>;
}

const TYPE_TONE: Record<ContractType, 'blue' | 'violet' | 'amber' | 'green' | 'gray'> = {
    software: 'blue',
    hardware: 'violet',
    service: 'amber',
    connectivity: 'green',
    other: 'gray',
};

export default function ContractsPage() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user } = useAuth();
    const role = (user?.role ?? 'user') as Role;
    const perms = user?.permissions ?? [];
    const isSuper = role === 'super';
    const canCreate = isSuper || perms.includes('contracts.create');
    const canEdit = isSuper || perms.includes('contracts.edit');
    const canImport = isSuper || perms.includes('contracts.import');

    const [tab, setTab] = useState<Tab>(initialContractTab);
    const [search, setSearch] = useState('');
    const ALL_TYPES = '__all__';
    const [typeFilter, setTypeFilter] = useState<ContractType | ''>('');
    // Status filter on the "All" tab. '' = every contract; 'expiring' / 'expired' reuse the
    // backend tab filters. Set by the dashboard banners' "Review" buttons.
    const ALL_STATUS = '__all__';
    const [statusFilter, setStatusFilter] = useState<'' | 'expiring' | 'expired'>('');
    const [sort, setSort] = useState('end_asc');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Contract | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    // Newly created contract — pinned at the top with a "New" badge for 8 seconds.
    const [newlyCreated, setNewlyCreated] = useState<Contract | null>(null);
    const newlyCreatedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { data: summary } = useContractSummary();
    // The list endpoint's `tab` param doubles as the status filter: '' → all contracts,
    // 'expiring'/'expired' → the matching backend filter.
    const listEnabledTab = statusFilter || 'all';
    const {
        data: listData,
        isLoading,
        isFetching,
    } = useContracts({
        page,
        per_page: perPage,
        search,
        tab: listEnabledTab,
        type: typeFilter || undefined,
        sort,
    });
    const { data: selected } = useContract(selectedId);

    // Deep-link from a notification: /contracts?view=<id> opens that contract's
    // detail dialog, then clears the param so it doesn't reopen on refresh.
    const [searchParams, setSearchParams] = useSearchParams();
    const viewId = searchParams.get('view');
    useEffect(() => {
        if (!viewId) return;
        setSelectedId(Number(viewId));
        searchParams.delete('view');
        setSearchParams(searchParams, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewId]);

    const rows = listData?.data ?? [];
    const meta = listData?.meta;

    // Pagination footer values with fallbacks so the footer (incl. "Rows per page") can render
    // even during the initial load on a fresh reload, when `meta` is not yet available — matching
    // the Stock table, whose shared DataTable footer is always visible.
    const totalRows = meta?.total ?? 0;
    const perPageDisplay = meta?.per_page ?? perPage;
    const currentPage = meta?.current_page ?? page;
    const lastPage = meta?.last_page ?? 1;

    // Switch tab and remember it in both the URL (?tab=, for reload / shared links) and
    // localStorage (so navigating away and back — which clears the URL — restores it).
    const changeTab = useCallback(
        (next: Tab) => {
            setTab(next);
            localStorage.setItem(CONTRACT_TAB_KEY, next);
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

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };
    // Open the Edit wizard over the current View. selectedId is kept so that
    // closing the form returns the user to the (now refreshed) detail dialog.
    const openEdit = (c: Contract) => {
        setEditing(c);
        setFormOpen(true);
    };

    /** Called by ContractFormDrawer after a new contract is saved. */
    const handleCreated = (contract: Contract) => {
        // Switch to the "all" tab (with no status filter) and go to page 1 so the user can see the list.
        changeTab('all');
        setStatusFilter('');
        setPage(1);
        // Pin the new row at the top for 8 seconds.
        if (newlyCreatedTimer.current) clearTimeout(newlyCreatedTimer.current);
        setNewlyCreated(contract);
        newlyCreatedTimer.current = setTimeout(() => setNewlyCreated(null), 8000);
    };

    const maxVendor = summary?.top_vendors?.[0]?.amount ?? 1;
    // Whether either alert banner is showing — used to tighten the gap (≈10px) above the table.
    const hasBanners = !!summary?.expiring || !!summary?.expired;

    // Set filters (type/status/sort ≠ default) — drives the FilterPopover count badge.
    const DEFAULT_SORT = 'end_asc';
    const activeFilterCount = (typeFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (sort !== DEFAULT_SORT ? 1 : 0);
    // True when any list control differs from its default — drives the quick "Clear filters" pill.
    const hasActiveFilters = !!search || activeFilterCount > 0;

    /** Reset search, type/status filters and sort back to their defaults. */
    const clearFilters = () => {
        setSearch('');
        setTypeFilter('');
        setStatusFilter('');
        setSort(DEFAULT_SORT);
        setPage(1);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('contracts_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('contracts_sub')}</p>
                </div>
                <div className="flex gap-2">
                    {canImport && (
                        <Button variant="outline" onClick={() => setImportOpen(true)}>
                            <Import className="h-4 w-4" />
                            {t('import_contract')}
                        </Button>
                    )}
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
                    <style>{bannerBlinkStyles}</style>
                    {!!summary?.expiring && (
                        <div className="rounded-md bg-amber-50 p-4 dark:bg-amber-500/10">
                            <div className="flex">
                                <div className="shrink-0">
                                    <AlertTriangle className="cf-blink h-5 w-5 text-amber-500 dark:text-amber-400" />
                                </div>
                                <div className="ml-3 flex-1 md:flex md:items-center md:justify-between">
                                    <p className="text-foreground text-sm font-medium">
                                        {lang === 'th'
                                            ? `ใกล้หมดอายุ : ${summary.expiring} สัญญา`
                                            : `Expiring Soon : ${summary.expiring} Contract${summary.expiring !== 1 ? 's' : ''}`}
                                    </p>
                                    <p className="mt-3 text-sm md:mt-0 md:ml-6">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                changeTab('all');
                                                setStatusFilter('expiring');
                                                setPage(1);
                                            }}
                                            className="font-medium whitespace-nowrap text-amber-800 hover:text-amber-600 dark:text-amber-300 dark:hover:text-amber-200"
                                        >
                                            {lang === 'th' ? 'ตรวจสอบ' : 'Review'}
                                            <span aria-hidden="true"> →</span>
                                        </button>
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {!!summary?.expired && (
                        <div className="rounded-md bg-red-50 p-4 dark:bg-red-500/10">
                            <div className="flex">
                                <div className="shrink-0">
                                    <AlertOctagon className="cf-blink h-5 w-5 text-red-500 dark:text-red-400" />
                                </div>
                                <div className="ml-3 flex-1 md:flex md:items-center md:justify-between">
                                    <p className="text-foreground text-sm font-medium">
                                        {lang === 'th'
                                            ? `หมดอายุแล้ว : ${summary.expired} สัญญา`
                                            : `Expired : ${summary.expired} Contract${summary.expired !== 1 ? 's' : ''}`}
                                    </p>
                                    <p className="mt-3 text-sm md:mt-0 md:ml-6">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                changeTab('all');
                                                setStatusFilter('expired');
                                                setPage(1);
                                            }}
                                            className="font-medium whitespace-nowrap text-red-800 hover:text-red-600 dark:text-red-300 dark:hover:text-red-200"
                                        >
                                            {lang === 'th' ? 'ตรวจสอบ' : 'Review'}
                                            <span aria-hidden="true"> →</span>
                                        </button>
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <Card className="overflow-hidden">
                <div className="border-border flex gap-1 border-b px-2">
                    {(
                        [
                            { id: 'dashboard', label: t('sub_dashboard') },
                            { id: 'all', label: t('all_contracts'), count: summary?.total },
                        ] as { id: Tab; label: string; count?: number }[]
                    ).map((tb) => (
                        <button
                            key={tb.id}
                            onClick={() => {
                                changeTab(tb.id);
                                setPage(1);
                                setTypeFilter('');
                                setStatusFilter('');
                            }}
                            className={cn(
                                'relative px-4 py-3 text-sm font-medium transition-colors',
                                tab === tb.id ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {tb.label}
                            {tb.count != null && <span className="ml-1.5 font-mono text-xs opacity-60">{tb.count}</span>}
                            {tab === tb.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
                        </button>
                    ))}
                </div>

                {tab === 'dashboard' ? (
                    <DashboardTab summary={summary} maxVendor={maxVendor} onSelect={setSelectedId} />
                ) : (
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
                                    placeholder={`${t('contract_vendor')} / ${t('contract_title')}`}
                                    className="pl-9"
                                />
                            </div>
                            <FilterPopover count={activeFilterCount} width={460} onClear={clearFilters} resultCount={totalRows}>
                                {() => {
                                    const sortOptions = [
                                        { value: 'end_asc', label: lang === 'th' ? 'วันหมดอายุ (ใกล้สุดก่อน)' : 'Expiry: soonest first' },
                                        { value: 'end_desc', label: lang === 'th' ? 'วันหมดอายุ (ไกลสุดก่อน)' : 'Expiry: latest first' },
                                        { value: 'created_desc', label: lang === 'th' ? 'เพิ่มล่าสุด' : 'Newest added' },
                                        { value: 'created_asc', label: lang === 'th' ? 'เพิ่มเก่าสุด' : 'Oldest added' },
                                        { value: 'value_desc', label: lang === 'th' ? 'มูลค่า (สูงสุดก่อน)' : 'Value: highest first' },
                                        { value: 'value_asc', label: lang === 'th' ? 'มูลค่า (ต่ำสุดก่อน)' : 'Value: lowest first' },
                                    ];
                                    return (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                    <Filter className="h-3.5 w-3.5" />
                                                    {lang === 'th' ? 'ประเภท' : 'Type'}
                                                </div>
                                                <SearchableSelect
                                                    active={!!typeFilter}
                                                    value={typeFilter || ALL_TYPES}
                                                    onChange={(v) => {
                                                        setTypeFilter(v === ALL_TYPES ? '' : (v as ContractType));
                                                        setPage(1);
                                                    }}
                                                    options={[
                                                        {
                                                            value: ALL_TYPES,
                                                            label: lang === 'th' ? 'ทุกประเภท' : 'All types',
                                                            search: lang === 'th' ? 'ทุกประเภท' : 'All types',
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
                                                    {lang === 'th' ? 'สถานะ' : 'Status'}
                                                </div>
                                                <SearchableSelect
                                                    active={!!statusFilter}
                                                    value={statusFilter || ALL_STATUS}
                                                    onChange={(v) => {
                                                        setStatusFilter(v === ALL_STATUS ? '' : (v as 'expiring' | 'expired'));
                                                        setPage(1);
                                                    }}
                                                    options={[
                                                        {
                                                            value: ALL_STATUS,
                                                            label: lang === 'th' ? 'ทุกสถานะ' : 'All statuses',
                                                            search: lang === 'th' ? 'ทุกสถานะ' : 'All statuses',
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
                                                    {lang === 'th' ? 'เรียงตาม' : 'Sort by'}
                                                </div>
                                                <SearchableSelect
                                                    active={sort !== DEFAULT_SORT}
                                                    value={sort}
                                                    onChange={(v) => {
                                                        setSort(v);
                                                        setPage(1);
                                                    }}
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

                        <div className="border-border overflow-hidden rounded-xl border">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-border bg-muted/40 text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                            <th className="px-4 py-2.5">{t('contract_code')}</th>
                                            <th className="px-4 py-2.5">{t('contract_title')}</th>
                                            <th className="px-4 py-2.5">{t('contract_vendor')}</th>
                                            <th className="px-4 py-2.5">{t('contract_type')}</th>
                                            <th className="px-4 py-2.5">{t('contract_start')}</th>
                                            <th className="px-4 py-2.5">{t('contract_end')}</th>
                                            <th className="px-4 py-2.5">{t('contract_days_remaining')}</th>
                                            <th className="px-4 py-2.5">{t('contract_value')}</th>
                                            <th className="px-4 py-2.5">{t('status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* Shimmering skeleton rows during initial load and refetch (filter/sort/page) — matches the Stock table. */}
                                        {isLoading || isFetching ? (
                                            Array.from({ length: 8 }).map((_, r) => (
                                                <tr key={`skeleton-${r}`} className="border-border/60 border-b last:border-0">
                                                    {Array.from({ length: 9 }).map((_, c) => (
                                                        <td key={c} className="px-4 py-2.5">
                                                            <div className="bg-muted h-4 w-3/4 max-w-[160px] animate-pulse rounded" />
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))
                                        ) : rows.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} className="text-muted-foreground px-4 py-16 text-center text-sm">
                                                    {t('contract_none')}
                                                </td>
                                            </tr>
                                        ) : (
                                            <>
                                                {/* Newly-created contract pinned at top, independent of current sort order. */}
                                                {newlyCreated && (
                                                    <ContractRow key={`new-${newlyCreated.id}`} c={newlyCreated} isNew onSelect={setSelectedId} />
                                                )}
                                                {rows
                                                    .filter((c) => c.id !== newlyCreated?.id)
                                                    .map((c) => (
                                                        <ContractRow key={c.id} c={c} onSelect={setSelectedId} />
                                                    ))}
                                            </>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
                            <div className="flex items-center gap-2">
                                <span>{lang === 'th' ? 'แสดง' : 'Rows per page'}</span>
                                <Select
                                    value={String(perPage)}
                                    onValueChange={(v) => {
                                        setPerPage(Number(v));
                                        setPage(1);
                                    }}
                                >
                                    <SelectTrigger className="h-8 w-[72px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[20, 50, 100].map((n) => (
                                            <SelectItem key={n} value={String(n)}>
                                                {n}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-3">
                                <span>
                                    {totalRows === 0 ? 0 : (currentPage - 1) * perPageDisplay + 1}–{Math.min(currentPage * perPageDisplay, totalRows)}{' '}
                                    {lang === 'th' ? 'จาก' : 'of'} {totalRows}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page <= 1}
                                        className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <span className="text-foreground px-1 font-medium">
                                        {currentPage} / {lastPage}
                                    </span>
                                    <button
                                        onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                                        disabled={page >= lastPage}
                                        className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            <ContractDetailDrawer
                contract={formOpen ? null : (selected ?? null)}
                onClose={() => setSelectedId(null)}
                onEdit={openEdit}
                canEdit={canEdit}
            />
            <ContractFormDrawer open={formOpen} editing={editing} onClose={() => setFormOpen(false)} onCreated={handleCreated} />
            <ImportContractDialog open={importOpen} onClose={() => setImportOpen(false)} />
        </div>
    );
}

/** Single contract row — shared by the normal list and the "new" pinned row. */
function ContractRow({ c, isNew = false, onSelect }: { c: Contract; isNew?: boolean; onSelect: (id: number) => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (
        <tr
            onClick={() => onSelect(c.id)}
            className={cn(
                'border-border/60 cursor-pointer border-b transition-colors last:border-0',
                isNew ? 'animate-in fade-in bg-emerald-500/8 duration-500 hover:bg-emerald-500/12' : 'hover:bg-accent/40',
            )}
        >
            <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-mono text-xs">{c.code}</span>
                    {isNew && (
                        <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">
                            {lang === 'th' ? 'ใหม่' : 'New'}
                        </span>
                    )}
                </div>
            </td>
            <td className="max-w-[280px] truncate px-4 py-2.5">{c.title || <span className="text-muted-foreground">—</span>}</td>
            <td className="px-4 py-2.5 font-medium">{c.vendor}</td>
            <td className="px-4 py-2.5">
                <StatusBadge tone={TYPE_TONE[c.type]}>{t(`contract_type_${c.type}`)}</StatusBadge>
            </td>
            <td className="px-4 py-2.5 font-mono text-xs">{c.start}</td>
            <td className="px-4 py-2.5 font-mono text-xs">{c.end}</td>
            <td className="px-4 py-2.5">
                <DaysCell days={c.days_remaining} inReminder={c.in_reminder} status={c.status} />
            </td>
            <td className="px-4 py-2.5 font-mono text-xs">{c.value_display}</td>
            <td className="px-4 py-2.5">
                <StatusBadge tone={c.status === 'cancelled' ? 'gray' : c.status === 'expired' ? 'red' : 'green'}>
                    {c.status === 'cancelled'
                        ? t('contract_cancelled')
                        : c.status === 'expired'
                          ? lang === 'th'
                              ? 'หมดอายุ'
                              : 'Expired'
                          : lang === 'th'
                            ? 'ใช้งาน'
                            : 'Active'}
                </StatusBadge>
            </td>
        </tr>
    );
}

/** Scoped keyframes for the Contracts dashboard — staggered row reveal, matching the Stock dashboard feel. */
const contractDashStyles = `
@keyframes cf-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.cf-row { animation: cf-fade .35s ease both; }
@media (prefers-reduced-motion: reduce) { .cf-row { animation: none; } }
`;

/** Attention-grabbing double-blink (+ slight zoom) for the alert-banner icons. */
const bannerBlinkStyles = `
@keyframes cf-blink {
  0%, 100% { opacity: 1; transform: scale(1); }
  20% { opacity: .25; transform: scale(1.25); }
  40% { opacity: 1; transform: scale(1); }
  60% { opacity: .25; transform: scale(1.25); }
  80% { opacity: 1; transform: scale(1); }
}
.cf-blink { animation: cf-blink 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .cf-blink { animation: none; } }
`;

function DashboardTab({
    summary,
    maxVendor,
    onSelect,
}: {
    summary: ReturnType<typeof useContractSummary>['data'];
    maxVendor: number;
    onSelect: (id: number) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { symbol } = useCurrency();

    // Loading state mirrors the real layout with pulsing placeholders (same feel as the Stock dashboard).
    if (!summary)
        return (
            <div className="space-y-6 p-5">
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
                <div className="grid gap-6 lg:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <Card key={i} className="p-5">
                            <div className="bg-muted mb-4 h-3 w-32 animate-pulse rounded" />
                            <div className="bg-muted/60 h-44 animate-pulse rounded" />
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
            label: d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { month: 'short' }),
            year: d.getFullYear(),
            isNow: offset === 0,
        };
    });

    // Place each contract at its true position along the axis (0–1 across the 12
    // months) by its expiry day, then stack into lanes so near-overlapping dots
    // spread vertically instead of piling on one spot — a real scatter timeline.
    const points = summary.timeline
        .map((c) => {
            const [y, mo, day] = c.end.split('-').map(Number);
            let idx = months.findIndex((m) => m.key === `${y}-${mo - 1}`);
            let within = 0.5;
            if (idx === -1) {
                // Outside the window: pin already-expired to the far left, far-future to the right.
                idx = c.days <= 0 ? 0 : 11;
                within = c.days <= 0 ? 0.1 : 0.9;
            } else {
                const daysInMonth = new Date(y, mo, 0).getDate();
                within = Math.min(0.95, Math.max(0.05, (day - 0.5) / daysInMonth));
            }
            return { c, frac: (idx + within) / 12 };
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
        <div className="space-y-6 p-5">
            <style>{contractDashStyles}</style>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label={t('contract_total')} value={summary.total} icon={FileText} />
                <StatCard label={t('contract_active')} value={summary.active} icon={CheckCircle2} />
                <StatCard
                    label={t('expiring_soon')}
                    value={summary.expiring}
                    hint={lang === 'th' ? 'ตามช่วงแจ้งเตือนสัญญา' : 'within reminder window'}
                    hintDanger
                    icon={Clock}
                />
                <StatCard
                    label={t('contract_annual_value')}
                    value={summary.annual_value}
                    hint={lang === 'th' ? 'ไม่รวมสัญญาที่ยกเลิก' : 'excluding cancelled'}
                    icon={TrendingUp}
                />
            </div>

            {/* Expiry timeline — 12 months, starting 2 months back with NOW in the third column */}
            <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{t('contract_timeline')}</span>
                    <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
                        <span className="flex items-center gap-1.5">
                            <span className="bg-brand h-2 w-2 rounded-full" />
                            {lang === 'th' ? 'กำลังจะถึง' : 'Upcoming'}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            {lang === 'th' ? 'ในช่วงแจ้งเตือน' : 'In reminder window'}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="bg-destructive h-2 w-2 rounded-full" />
                            {lang === 'th' ? 'เลยกำหนด' : 'Overdue'}
                        </span>
                    </div>
                </div>

                {summary.timeline.length === 0 ? (
                    <div className="bg-muted/50 text-muted-foreground rounded-md px-3 py-6 text-center text-sm">
                        {lang === 'th' ? 'ไม่มีสัญญาที่หมดอายุในช่วง 12 เดือนนี้' : 'No expirations in this 12-month window.'}
                    </div>
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
                            {placed.map(({ c, frac, lane }) => (
                                <button
                                    key={c.id}
                                    title={
                                        c.days <= 0
                                            ? `${c.code} · ${c.name} — ${c.end} (${lang === 'th' ? `หมดอายุไป ${-c.days} วัน` : `expired ${-c.days}d ago`})`
                                            : `${c.code} · ${c.name} — ${c.end} (${c.days} ${lang === 'th' ? 'วัน' : 'days'})`
                                    }
                                    onClick={() => onSelect(c.id)}
                                    className={cn(
                                        'ring-background absolute h-3 w-3 -translate-x-1/2 rounded-full ring-2 transition-transform hover:z-10 hover:scale-125',
                                        c.days <= 0 ? 'bg-destructive' : c.in_reminder ? 'bg-amber-500' : 'bg-brand',
                                    )}
                                    style={{ left: `${frac * 100}%`, bottom: `${8 + lane * 16}px` }}
                                />
                            ))}
                        </div>
                        <div className="relative z-10 mt-1 grid grid-cols-12 px-2 py-1.5">
                            {months.map((m) => (
                                <div key={m.key} className="text-center leading-tight">
                                    {m.isNow && (
                                        <div className="text-brand text-[9px] font-bold tracking-wide uppercase">
                                            {lang === 'th' ? 'ปัจจุบัน' : 'NOW'}
                                        </div>
                                    )}
                                    <div className={cn('text-[11px] font-medium', m.isNow ? 'text-brand font-bold' : 'text-foreground')}>
                                        {m.label}
                                    </div>
                                    <div className={cn('text-[10px]', m.isNow ? 'text-brand/80' : 'text-muted-foreground')}>{m.year}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Top vendors by spend */}
                <Card className="p-5">
                    <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{t('contract_top_vendors')}</div>
                    <div className="space-y-2.5">
                        {summary.top_vendors.map((r, i) => (
                            <div key={r.vendor} className="cf-row" style={{ animationDelay: `${i * 40}ms` }}>
                                <div className="mb-1 flex justify-between text-sm">
                                    <span>{r.vendor}</span>
                                    <span className="text-muted-foreground font-mono text-xs">
                                        {symbol}
                                        {Math.round(r.amount / 1000)}K
                                    </span>
                                </div>
                                <div className="bg-muted h-2 overflow-hidden rounded-full">
                                    <span className="bg-brand block h-full rounded-full" style={{ width: `${(r.amount / maxVendor) * 100}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Action queue */}
                <Card className="p-5">
                    <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{t('contract_action_queue')}</div>
                    {/* Up to 20 items (server-capped); scroll within the card so a long queue
                        doesn't stretch the layout past the Top-vendors card beside it. */}
                    <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                        {summary.action_queue.length === 0 && (
                            <div className="bg-muted/50 text-muted-foreground rounded-md px-3 py-4 text-center text-sm">—</div>
                        )}
                        {summary.action_queue.map((c, i) => (
                            <button
                                key={c.id}
                                onClick={() => onSelect(c.id)}
                                style={{ animationDelay: `${i * 40}ms` }}
                                className="cf-row border-border hover:bg-accent/40 flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors"
                            >
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                                    {c.days}d
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{c.name}</div>
                                    <div className="text-muted-foreground text-xs">{c.vendor}</div>
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
