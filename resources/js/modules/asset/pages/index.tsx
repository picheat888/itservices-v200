import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { useCategories, useWarehouses } from '@/modules/settings';
import { FilterPopover } from '@/shared/components/filter-popover';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { ToneDot } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import type { Asset, AssetStatus, AssetType, Role } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useUiStore } from '@/stores/ui';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowRight,
    Box,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    CircleDot,
    Clock,
    Download,
    Filter,
    Plus,
    RefreshCcw,
    Search,
    Share2,
    SquarePen,
    Tag,
    Trash2,
    Undo2,
    Warehouse,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { assetApi } from '../api/assetApi';
import { AssetDetailDrawer } from '../components/asset-detail-drawer';
import { AssetFormDrawer } from '../components/asset-form-drawer';
import { ASSET_STATUS_META, AssetStatusBadge, AssetStatusDot, AssetTypeIcon } from '../components/asset-meta';
import { AssetReceiveModal } from '../components/asset-receive-modal';
import { AssetTransferDrawer } from '../components/asset-transfer-drawer';
import { useAssetMutations, useAssets, useAssetSummary, useAssetTransfers, usePendingReturns } from '../hooks/use-assets';

// The page's tabs. The active tab is mirrored in the URL (?tab=) so a reload / shared link stays put,
// and also remembered in localStorage so navigating away and back (which resets the URL) restores it.
const TAB_IDS = ['dashboard', 'inventory', 'transfers'] as const;
type Tab = (typeof TAB_IDS)[number];

// localStorage key for the last-active tab — the fallback when the URL has no ?tab=
// (e.g. landing on /assets from the sidebar menu rather than a reload/shared link).
const ASSET_TAB_KEY = 'assets.tab';
const isAssetTab = (v: string | null): v is Tab => (TAB_IDS as readonly string[]).includes(v ?? '');

/** Resolve the starting tab: URL (?tab=) wins, then the last tab in localStorage, then the dashboard. */
function initialAssetTab(): Tab {
    const fromUrl = new URLSearchParams(window.location.search).get('tab');
    if (isAssetTab(fromUrl)) {
        return fromUrl;
    }
    const fromStore = localStorage.getItem(ASSET_TAB_KEY);
    return isAssetTab(fromStore) ? fromStore : 'dashboard';
}

function StatCard({ label, value, hint, icon: Icon }: { label: string; value: string | number; hint?: string; icon: typeof Box }) {
    return (
        <Card className="p-5">
            <div className="flex items-start justify-between">
                <div className="text-muted-foreground text-sm">{label}</div>
                <span className="bg-brand/10 text-brand flex h-9 w-9 items-center justify-center rounded-lg">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
            {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
        </Card>
    );
}

const ALL = '__all__';

export default function AssetsPage() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user } = useAuth();
    const role = (user?.role ?? 'user') as Role;
    const perms = user?.permissions ?? [];
    const isSuper = role === 'super';
    const canCreate = isSuper || perms.includes('assets.register');
    const canEdit = isSuper || perms.includes('assets.edit');
    const canTransfer = isSuper || perms.includes('assets.transfer');
    const canReceive = isSuper || perms.includes('assets.receive');
    const canRetire = isSuper || perms.includes('assets.retire');
    // Accepting a hand-over is the recipient's action only — matched by their employee code.
    const myEmpCode = user?.employee_code ?? null;

    const [searchParams, setSearchParams] = useSearchParams();
    const [tab, setTab] = useState<Tab>(initialAssetTab);

    // Switch tab and remember it in both the URL (?tab=, for reload / shared links) and
    // localStorage (so navigating away and back — which clears the URL — restores it).
    const changeTab = useCallback(
        (next: Tab) => {
            setTab(next);
            localStorage.setItem(ASSET_TAB_KEY, next);
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

    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<AssetType | ''>('');
    const [sourceFilter, setSourceFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>('');
    const [warehouseFilter, setWarehouseFilter] = useState('');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [detail, setDetail] = useState<Asset | null>(null);
    const [receiveAsset, setReceiveAsset] = useState<Asset | null>(null);

    // Transfers tab paginates client-side over the loaded list (backend returns the latest 100).
    const [transfersPage, setTransfersPage] = useState(1);
    const [transfersPerPage, setTransfersPerPage] = useState(20);

    const { data: warehouses = [] } = useWarehouses();
    const { data: categories = [] } = useCategories();

    // Deep-link from a contract's linked-assets list: /assets?view=<id> opens that asset's
    // detail drawer (fetched by id since it may not be on the current page), then clears the param.
    const viewId = searchParams.get('view');
    const { data: deepLinkedAsset } = useQuery({
        queryKey: ['asset', 'view', viewId],
        queryFn: () => assetApi.get(Number(viewId)),
        enabled: !!viewId,
    });
    useEffect(() => {
        if (!deepLinkedAsset) return;
        setDetail(deepLinkedAsset);
        setSearchParams(
            (prev) => {
                const sp = new URLSearchParams(prev);
                sp.delete('view');
                return sp;
            },
            { replace: true },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deepLinkedAsset]);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Asset | null>(null);
    const [transferAsset, setTransferAsset] = useState<Asset | null>(null);

    const { data: summary } = useAssetSummary();
    const { data: listData, isLoading } = useAssets({
        page,
        per_page: perPage,
        search,
        type: typeFilter || undefined,
        source: sourceFilter || undefined,
        status: statusFilter || undefined,
        warehouse: warehouseFilter || undefined,
    });
    const { accept, bulk } = useAssetMutations();
    const { data: transfers = [], isLoading: transfersLoading } = useAssetTransfers();
    const { data: pendingReturns = [] } = usePendingReturns();

    const rows = listData?.data ?? [];
    const meta = listData?.meta;

    // Pagination footer values with fallbacks so the footer (incl. "Rows per page") renders
    // even during the initial load on a fresh reload, when `meta` is not yet available —
    // matching the Stock/Contract tables whose footers stay visible.
    const totalRows = meta?.total ?? 0;
    const perPageDisplay = meta?.per_page ?? perPage;
    const currentPage = meta?.current_page ?? page;
    const lastPage = meta?.last_page ?? 1;

    // Client-side slice for the Transfers tab (the endpoint returns a flat list, not pages).
    const transfersTotal = transfers.length;
    const transfersPageCount = Math.max(1, Math.ceil(transfersTotal / transfersPerPage));
    const transfersSafePage = Math.min(transfersPage, transfersPageCount);
    const transfersStart = (transfersSafePage - 1) * transfersPerPage;
    const transfersRows = transfers.slice(transfersStart, transfersStart + transfersPerPage);

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };
    const openEdit = (a: Asset) => {
        setDetail(null);
        setEditing(a);
        setFormOpen(true);
    };

    const toggleRow = (id: number, on: boolean) => setSelectedIds((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
    const allOnPage = rows.length > 0 && rows.every((a) => selectedIds.includes(a.id));

    const runBulk = (op: 'writeoff') => {
        if (selectedIds.length === 0) return;
        bulk.mutate({ ids: selectedIds, op }, { onSuccess: () => setSelectedIds([]) });
    };

    // True when any inventory list control differs from its default — drives the quick "Clear filters" pill.
    const hasActiveFilters = !!search || !!typeFilter || !!sourceFilter || !!statusFilter || !!warehouseFilter;

    /** Reset the inventory search + type/source/status/warehouse filters back to their defaults. */
    const clearFilters = () => {
        setSearch('');
        setTypeFilter('');
        setSourceFilter('');
        setStatusFilter('');
        setWarehouseFilter('');
        setPage(1);
    };

    // Active filter chips (Stock pattern): one removable chip per set filter; also drives
    // the FilterPopover's count badge. Search has its own input, so it is not a chip.
    const activeChips = [
        typeFilter ? { key: 'type', label: typeFilter, clear: () => setTypeFilter('') } : null,
        sourceFilter
            ? { key: 'source', label: sourceFilter === 'purchased' ? t('asset_purchase') : t('asset_lease'), clear: () => setSourceFilter('') }
            : null,
        statusFilter ? { key: 'status', label: t(ASSET_STATUS_META[statusFilter].key), clear: () => setStatusFilter('') } : null,
        warehouseFilter ? { key: 'warehouse', label: warehouseFilter, clear: () => setWarehouseFilter('') } : null,
    ].filter((c): c is { key: string; label: string; clear: () => void } => c !== null);
    const activeFilterCount = activeChips.length;

    const typeBars = summary?.by_type ?? [];
    const maxTypeCount = Math.max(1, ...typeBars.map((b) => b.count));

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('assets_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('assets_sub')}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" disabled>
                        <Download className="h-4 w-4" />
                        {t('export')}
                    </Button>
                    {canCreate && (
                        <Button onClick={openCreate}>
                            <Plus className="h-4 w-4" />
                            {t('register_asset')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Admin warning — assets a holder has sent back, awaiting IT receipt into a warehouse. */}
            {canReceive && pendingReturns.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wide text-amber-600 uppercase dark:text-amber-400">
                        <Undo2 className="h-4 w-4" />
                        {t('asset_pending_return_title')}
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[11px]">{pendingReturns.length}</span>
                    </div>
                    <div className="space-y-1.5">
                        {pendingReturns.map((a) => (
                            <div key={a.id} className="bg-background/60 flex items-center gap-3 rounded-lg px-3 py-2">
                                <AssetTypeIcon type={a.type} className="text-muted-foreground h-4 w-4 shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">
                                        {a.model}
                                        {a.nickname && <span className="text-muted-foreground"> · {a.nickname}</span>}
                                    </div>
                                    <div className="text-muted-foreground truncate font-mono text-xs">
                                        {a.tag}
                                        {a.owner ? ` · ${lang === 'th' ? 'จาก' : 'from'} ${a.owner}` : ''}
                                    </div>
                                </div>
                                <Button size="sm" onClick={() => setReceiveAsset(a)}>
                                    <Check className="h-4 w-4" />
                                    {t('asset_mark_received')}
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label={t('asset_total')} value={summary?.total ?? 0} icon={Box} />
                <StatCard
                    label={t('asset_deployed')}
                    value={summary?.deployed ?? 0}
                    hint={`${summary?.ready ?? 0} ${t('asset_ready').toLowerCase()}`}
                    icon={CheckCircle2}
                />
                <StatCard label={t('asset_pending_accept')} value={summary?.pending_acceptance ?? 0} icon={Clock} />
                <StatCard label={t('asset_pending_return')} value={summary?.pending_return ?? 0} icon={RefreshCcw} />
            </div>

            <Card className="overflow-hidden">
                <div className="border-border flex gap-1 border-b px-2">
                    {(['dashboard', 'inventory', 'transfers'] as Tab[]).map((tb) => (
                        <button
                            key={tb}
                            onClick={() => changeTab(tb)}
                            className={cn(
                                'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                                tab === tb ? 'border-brand text-brand' : 'text-muted-foreground hover:text-foreground border-transparent',
                            )}
                        >
                            {tb === 'dashboard' ? t('asset_dashboard') : tb === 'inventory' ? t('asset_inventory') : t('asset_transfers')}
                            {tb === 'inventory' && <span className="text-muted-foreground ml-1.5 font-mono text-xs">{summary?.total ?? 0}</span>}
                        </button>
                    ))}
                </div>

                {tab === 'dashboard' && (
                    <div className="space-y-6 p-5">
                        <div>
                            <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{t('asset_by_type')}</div>
                            <div className="space-y-2">
                                {typeBars.map((b) => (
                                    <div key={b.type} className="flex items-center gap-3">
                                        <div className="flex w-28 items-center gap-2 text-sm">
                                            <AssetTypeIcon type={b.type} className="text-muted-foreground h-4 w-4" />
                                            {b.type}
                                        </div>
                                        <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                                            <div className="bg-brand h-full rounded-full" style={{ width: `${(b.count / maxTypeCount) * 100}%` }} />
                                        </div>
                                        <div className="w-8 text-right font-mono text-sm">{b.count}</div>
                                    </div>
                                ))}
                                {typeBars.length === 0 && <div className="text-muted-foreground py-6 text-center text-sm">{t('asset_none')}</div>}
                            </div>
                        </div>

                        <div>
                            <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{t('asset_top_value')}</div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                            <th className="px-3 py-2">{t('asset_tag')}</th>
                                            <th className="px-3 py-2">{t('asset_model')}</th>
                                            <th className="px-3 py-2">{t('asset_owner')}</th>
                                            <th className="px-3 py-2">{t('asset_status')}</th>
                                            <th className="px-3 py-2 text-right">{t('asset_value')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(summary?.top_value ?? []).map((a) => (
                                            <tr
                                                key={a.id}
                                                className="border-border/60 hover:bg-accent/40 cursor-pointer border-b last:border-0"
                                                onClick={() => setDetail(a)}
                                            >
                                                <td className="text-muted-foreground px-3 py-2 font-mono text-xs">{a.tag}</td>
                                                <td className="px-3 py-2 font-medium">{a.model}</td>
                                                <td className="px-3 py-2">{a.owner}</td>
                                                <td className="px-3 py-2">
                                                    <AssetStatusBadge status={a.status} t={t} />
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-semibold">{a.value_display}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'inventory' && (
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
                                    placeholder={t('asset_search')}
                                    className="pl-9"
                                />
                            </div>
                            <FilterPopover count={activeFilterCount} width={460} onClear={clearFilters} resultCount={totalRows}>
                                {() => (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                <Filter className="h-3.5 w-3.5" />
                                                {lang === 'th' ? 'ประเภท' : 'Type'}
                                            </div>
                                            <SearchableSelect
                                                active={!!typeFilter}
                                                value={typeFilter || ALL}
                                                onChange={(v) => {
                                                    setTypeFilter(v === ALL ? '' : (v as AssetType));
                                                    setPage(1);
                                                }}
                                                options={[
                                                    { value: ALL, label: t('asset_all'), search: t('asset_all'), icon: <ToneDot tone="gray" /> },
                                                    ...categories.map((c) => ({
                                                        value: c.name,
                                                        label: c.name,
                                                        search: c.name,
                                                        icon: <AssetTypeIcon type={c.name} className="text-muted-foreground h-4 w-4" />,
                                                    })),
                                                ]}
                                            />
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                <Tag className="h-3.5 w-3.5" />
                                                {lang === 'th' ? 'แหล่งที่มา' : 'Source'}
                                            </div>
                                            <SearchableSelect
                                                active={!!sourceFilter}
                                                value={sourceFilter || ALL}
                                                onChange={(v) => {
                                                    setSourceFilter(v === ALL ? '' : v);
                                                    setPage(1);
                                                }}
                                                options={[
                                                    { value: ALL, label: t('asset_all'), search: t('asset_all'), icon: <ToneDot tone="gray" /> },
                                                    {
                                                        value: 'purchased',
                                                        label: t('asset_purchase'),
                                                        search: t('asset_purchase'),
                                                        icon: <ToneDot tone="blue" />,
                                                    },
                                                    {
                                                        value: 'rented',
                                                        label: t('asset_lease'),
                                                        search: t('asset_lease'),
                                                        icon: <ToneDot tone="violet" />,
                                                    },
                                                ]}
                                            />
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                <CircleDot className="h-3.5 w-3.5" />
                                                {t('asset_status')}
                                            </div>
                                            <SearchableSelect
                                                active={!!statusFilter}
                                                value={statusFilter || ALL}
                                                onChange={(v) => {
                                                    setStatusFilter(v === ALL ? '' : (v as AssetStatus));
                                                    setPage(1);
                                                }}
                                                options={[
                                                    { value: ALL, label: t('asset_all'), search: t('asset_all'), icon: <ToneDot tone="gray" /> },
                                                    ...(Object.keys(ASSET_STATUS_META) as AssetStatus[]).map((s) => ({
                                                        value: s,
                                                        label: t(ASSET_STATUS_META[s].key),
                                                        search: t(ASSET_STATUS_META[s].key),
                                                        icon: <AssetStatusDot status={s} />,
                                                    })),
                                                ]}
                                            />
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                <Warehouse className="h-3.5 w-3.5" />
                                                {t('asset_warehouse')}
                                            </div>
                                            <SearchableSelect
                                                active={!!warehouseFilter}
                                                value={warehouseFilter || ALL}
                                                onChange={(v) => {
                                                    setWarehouseFilter(v === ALL ? '' : v);
                                                    setPage(1);
                                                }}
                                                options={[
                                                    { value: ALL, label: t('asset_all'), search: t('asset_all'), icon: <ToneDot tone="gray" /> },
                                                    ...warehouses.map((w) => ({
                                                        value: w.name,
                                                        label: w.name,
                                                        search: w.name,
                                                        icon: <Warehouse className="text-muted-foreground/70 h-4 w-4" />,
                                                    })),
                                                ]}
                                            />
                                        </div>
                                    </div>
                                )}
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

                        {activeChips.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                {activeChips.map((c) => (
                                    <button
                                        key={c.key}
                                        type="button"
                                        onClick={c.clear}
                                        className="bg-brand/10 text-brand hover:bg-brand/20 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                                    >
                                        {c.label}
                                        <X className="h-3 w-3" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {selectedIds.length > 0 && (
                            <div className="bg-brand/5 border-border flex items-center gap-3 rounded-lg border px-4 py-2.5">
                                <span className="text-brand text-sm font-semibold">
                                    {lang === 'th'
                                        ? `${t('asset_selected')} ${selectedIds.length} ${lang === 'th' ? 'รายการ' : ''}`
                                        : `${selectedIds.length} ${t('asset_selected')}`}
                                </span>
                                <button className="text-muted-foreground text-xs hover:underline" onClick={() => setSelectedIds([])}>
                                    {t('asset_clear')}
                                </button>
                                <div className="flex-1" />
                                {canRetire && (
                                    <Button size="sm" variant="destructive" onClick={() => runBulk('writeoff')} disabled={bulk.isPending}>
                                        <Trash2 className="h-4 w-4" />
                                        {t('asset_writeoff')}
                                    </Button>
                                )}
                            </div>
                        )}

                        <div className="border-border overflow-hidden rounded-xl border">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-border bg-muted/40 text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                            <th className="w-8 px-4 py-2.5">
                                                <input
                                                    type="checkbox"
                                                    checked={allOnPage}
                                                    onChange={(e) =>
                                                        setSelectedIds(
                                                            e.target.checked
                                                                ? [...new Set([...selectedIds, ...rows.map((a) => a.id)])]
                                                                : selectedIds.filter((id) => !rows.some((a) => a.id === id)),
                                                        )
                                                    }
                                                />
                                            </th>
                                            <th className="px-4 py-2.5">{t('asset_tag')}</th>
                                            <th className="px-4 py-2.5">{t('asset_type')}</th>
                                            <th className="px-4 py-2.5">{t('asset_model')}</th>
                                            <th className="px-4 py-2.5">{t('asset_owner')}</th>
                                            <th className="px-4 py-2.5">{t('asset_dept')}</th>
                                            <th className="px-4 py-2.5">{t('asset_warehouse')}</th>
                                            <th className="px-4 py-2.5">{t('asset_status')}</th>
                                            <th className="px-4 py-2.5">{t('asset_value')}</th>
                                            <th className="px-4 py-2.5 text-right">{t('asset_actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {isLoading ? (
                                            Array.from({ length: 8 }).map((_, r) => (
                                                <tr key={`skeleton-${r}`} className="border-border/60 border-b last:border-0">
                                                    {Array.from({ length: 10 }).map((_, c) => (
                                                        <td key={c} className="px-4 py-2.5">
                                                            <div className="bg-muted h-4 w-3/4 max-w-[160px] animate-pulse rounded" />
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))
                                        ) : rows.length === 0 ? (
                                            <tr>
                                                <td colSpan={10} className="text-muted-foreground px-4 py-16 text-center text-sm">
                                                    {t('asset_none')}
                                                </td>
                                            </tr>
                                        ) : (
                                            rows.map((a) => (
                                                <tr
                                                    key={a.id}
                                                    onClick={() => setDetail(a)}
                                                    className={cn(
                                                        'border-border/60 cursor-pointer border-b last:border-0',
                                                        selectedIds.includes(a.id) ? 'bg-brand/5' : 'hover:bg-accent/40',
                                                    )}
                                                >
                                                    <td className="px-4 py-2.5">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.includes(a.id)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => toggleRow(a.id, e.target.checked)}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="text-muted-foreground font-mono text-xs">{a.tag}</div>
                                                        {a.nickname && (
                                                            <span className="bg-brand/10 text-brand mt-1 inline-block max-w-[140px] truncate rounded px-1.5 py-0.5 text-[10px] font-medium">
                                                                {a.nickname}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <span className="flex items-center gap-2">
                                                            <AssetTypeIcon type={a.type} className="text-muted-foreground h-4 w-4" />
                                                            {a.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 font-medium">{a.model}</td>
                                                    <td className="px-4 py-2.5">{a.owner}</td>
                                                    <td className="px-4 py-2.5">{a.department}</td>
                                                    <td className="px-4 py-2.5">
                                                        {a.warehouse ? (
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <Warehouse className="text-muted-foreground/70 h-3.5 w-3.5 shrink-0" />
                                                                {a.warehouse}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <AssetStatusBadge status={a.status} t={t} />
                                                    </td>
                                                    <td className="px-4 py-2.5 font-mono text-xs">{a.value_display}</td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center justify-end gap-1">
                                                            {a.status === 'pending_acceptance' && !!myEmpCode && a.owner === myEmpCode && (
                                                                <button
                                                                    className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md text-emerald-600"
                                                                    title={t('asset_accept')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        accept.mutate(a.id);
                                                                    }}
                                                                >
                                                                    <Check className="h-4 w-4" />
                                                                </button>
                                                            )}
                                                            {canReceive && a.status === 'pending_return' && (
                                                                <button
                                                                    className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md text-emerald-600"
                                                                    title={t('asset_mark_received')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setReceiveAsset(a);
                                                                    }}
                                                                >
                                                                    <CheckCircle2 className="h-4 w-4" />
                                                                </button>
                                                            )}
                                                            {canTransfer && a.status === 'ready' && (
                                                                <button
                                                                    className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md"
                                                                    title={t('transfer_asset')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setTransferAsset(a);
                                                                    }}
                                                                >
                                                                    <Share2 className="h-4 w-4" />
                                                                </button>
                                                            )}
                                                            {canEdit && (
                                                                <button
                                                                    className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md"
                                                                    title={t('edit_asset')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openEdit(a);
                                                                    }}
                                                                >
                                                                    <SquarePen className="h-4 w-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
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
                                    {t('asset_of')} {totalRows}
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

                {tab === 'transfers' && (
                    <div className="space-y-3 p-5">
                        <div className="border-border overflow-hidden rounded-xl border">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-border bg-muted/40 text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                            <th className="px-4 py-2.5">{t('asset_registered')}</th>
                                            <th className="px-4 py-2.5">{t('asset_tag')}</th>
                                            <th className="px-4 py-2.5">{lang === 'th' ? 'จาก' : 'From'}</th>
                                            <th className="px-4 py-2.5" />
                                            <th className="px-4 py-2.5">{lang === 'th' ? 'ถึง' : 'To'}</th>
                                            <th className="px-4 py-2.5">{t('asset_reason')}</th>
                                            <th className="px-4 py-2.5">{lang === 'th' ? 'โดย' : 'By'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transfersLoading ? (
                                            Array.from({ length: 8 }).map((_, r) => (
                                                <tr key={`skeleton-${r}`} className="border-border/60 border-b last:border-0">
                                                    {Array.from({ length: 7 }).map((_, c) => (
                                                        <td key={c} className="px-4 py-2.5">
                                                            <div className="bg-muted h-4 w-3/4 max-w-[160px] animate-pulse rounded" />
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))
                                        ) : transfers.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="text-muted-foreground px-4 py-16 text-center text-sm">
                                                    {t('asset_none')}
                                                </td>
                                            </tr>
                                        ) : (
                                            transfersRows.map((tr) => (
                                                <tr key={tr.id} className="border-border/60 border-b last:border-0">
                                                    <td className="px-4 py-2.5 font-mono text-xs">{tr.date}</td>
                                                    <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">{tr.asset_tag}</td>
                                                    <td className="px-4 py-2.5">{tr.from_owner ?? '—'}</td>
                                                    <td className="text-muted-foreground px-4 py-2.5">
                                                        <ArrowRight className="h-4 w-4" />
                                                    </td>
                                                    <td className="px-4 py-2.5 font-medium">{tr.to_owner}</td>
                                                    <td className="text-muted-foreground px-4 py-2.5">{tr.reason ?? '—'}</td>
                                                    <td className="px-4 py-2.5">{tr.performed_by ?? '—'}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
                            <div className="flex items-center gap-2">
                                <span>{lang === 'th' ? 'แสดง' : 'Rows per page'}</span>
                                <Select
                                    value={String(transfersPerPage)}
                                    onValueChange={(v) => {
                                        setTransfersPerPage(Number(v));
                                        setTransfersPage(1);
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
                                    {transfersTotal === 0 ? 0 : transfersStart + 1}–{Math.min(transfersStart + transfersPerPage, transfersTotal)}{' '}
                                    {t('asset_of')} {transfersTotal}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setTransfersPage((p) => Math.max(1, p - 1))}
                                        disabled={transfersSafePage <= 1}
                                        className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <span className="text-foreground px-1 font-medium">
                                        {transfersSafePage} / {transfersPageCount}
                                    </span>
                                    <button
                                        onClick={() => setTransfersPage((p) => Math.min(transfersPageCount, p + 1))}
                                        disabled={transfersSafePage >= transfersPageCount}
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

            <AssetDetailDrawer
                asset={detail}
                onClose={() => setDetail(null)}
                onTransfer={(a) => {
                    setDetail(null);
                    setTransferAsset(a);
                }}
                onReceive={(a) => {
                    setDetail(null);
                    setReceiveAsset(a);
                }}
                onEdit={canEdit ? openEdit : undefined}
                canTransfer={canTransfer}
                canReceive={canReceive}
            />
            <AssetFormDrawer open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
            <AssetTransferDrawer asset={transferAsset} onClose={() => setTransferAsset(null)} />
            <AssetReceiveModal asset={receiveAsset} onClose={() => setReceiveAsset(null)} />
        </div>
    );
}
