import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { useCategories, useWarehouses } from '@/modules/settings';
import { FilterPopover } from '@/shared/components/filter-popover';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { ToneDot } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import type { Asset, AssetStatus, AssetType } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useUiStore } from '@/stores/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
    FlaskConicalOff,
    Layers,
    Lock,
    PackageCheck,
    Plus,
    RefreshCcw,
    Search,
    Share2,
    SquarePen,
    Tag,
    TrendingUp,
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
import { AssetTagBadge } from '../components/asset-tag-badge';
import { AssetTransferDialog } from '../components/asset-transfer-dialog';
import { useAssetMutations, useAssets, useAssetSummary, useAssetTransfers, usePendingReturns } from '../hooks/use-assets';

// The page's tabs. The active tab is mirrored in the URL (?tab=) so a reload / shared link stays put.
const TAB_IDS = ['dashboard', 'inventory', 'transfers'] as const;
type Tab = (typeof TAB_IDS)[number];

const isAssetTab = (v: string | null): v is Tab => (TAB_IDS as readonly string[]).includes(v ?? '');

/** Resolve the starting tab from the URL (?tab=) so reloads / shared links are exact; otherwise the dashboard. */
function initialAssetTab(): Tab {
    const fromUrl = new URLSearchParams(window.location.search).get('tab');
    return isAssetTab(fromUrl) ? fromUrl : 'dashboard';
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

/** Pulse skeleton mirroring the dashboard layout (KPI row + two cards) while the summary loads. */
function AssetDashboardSkeleton() {
    return (
        <div className="space-y-6 p-5">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="p-5">
                        <div className="flex items-start justify-between">
                            <div className="bg-muted h-4 w-20 animate-pulse rounded" />
                            <div className="bg-muted h-9 w-9 animate-pulse rounded-lg" />
                        </div>
                        <div className="bg-muted mt-3 h-8 w-14 animate-pulse rounded" />
                    </Card>
                ))}
            </div>
            <Card className="overflow-hidden">
                <div className="border-border border-b px-5 py-3.5">
                    <div className="bg-muted h-4 w-40 animate-pulse rounded" />
                </div>
                <div className="space-y-3.5 p-5">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="bg-muted h-4 w-36 shrink-0 animate-pulse rounded" />
                            <div className="bg-muted h-2 flex-1 animate-pulse rounded-full" />
                            <div className="bg-muted h-4 w-6 shrink-0 animate-pulse rounded" />
                        </div>
                    ))}
                </div>
            </Card>
            <Card className="overflow-hidden">
                <div className="border-border border-b px-5 py-3.5">
                    <div className="bg-muted h-4 w-40 animate-pulse rounded" />
                </div>
                <div className="space-y-2 p-5">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="bg-muted h-8 w-full animate-pulse rounded" />
                    ))}
                </div>
            </Card>
        </div>
    );
}

export default function AssetsPage() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user, can } = useAuth();
    const canCreate = can('assets.register');
    const canEdit = can('assets.edit');
    const canTransfer = can('assets.transfer');
    const canReceive = can('assets.receive');
    const canRetire = can('assets.retire');
    const canForceRecall = can('assets.force_recall');
    const canCancelWriteoff = can('assets.cancel_writeoff');
    const canDelete = can('assets.delete');
    const canViewDashboard = can('assets.view_dashboard');
    // Accepting a hand-over is the recipient's action only — matched by their employee code.
    const myEmpCode = user?.employee_code ?? null;

    const [searchParams, setSearchParams] = useSearchParams();
    const [tab, setTab] = useState<Tab>(initialAssetTab);

    // Switch tab and mirror it in the URL (?tab=) so reloads / shared links stay put.
    const changeTab = useCallback(
        (next: Tab) => {
            setTab(next);
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

    // The Dashboard tab is gated by assets.view_dashboard — bounce a role without it to Inventory.
    useEffect(() => {
        if (tab === 'dashboard' && !canViewDashboard) {
            changeTab('inventory');
        }
    }, [tab, canViewDashboard, changeTab]);

    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<AssetType | ''>('');
    const [sourceFilter, setSourceFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>('');
    const [warehouseFilter, setWarehouseFilter] = useState('');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    // Multi-select is locked to one status group; `selectionStatus` is that group.
    const [selectionStatus, setSelectionStatus] = useState<AssetStatus | null>(null);
    const [bulkDialog, setBulkDialog] = useState<null | 'transfer' | 'recall' | 'receive'>(null);
    const [receiveAsset, setReceiveAsset] = useState<Asset | null>(null);

    // Transfers tab paginates client-side over the loaded list (backend returns the latest 100).
    const [transfersPage, setTransfersPage] = useState(1);
    const [transfersPerPage, setTransfersPerPage] = useState(20);

    const { data: warehouses = [] } = useWarehouses();
    const { data: categories = [] } = useCategories();

    // The detail drawer is URL-driven (?view=<id>): a reload / shared link reopens it and closing
    // drops the param. Opening seeds the query cache with the clicked row so the drawer shows
    // instantly; a deep-link (id not on the current page) fetches by id. URL = single source of truth.
    const qc = useQueryClient();
    const viewId = searchParams.get('view');
    const openId = viewId ? Number(viewId) : null;
    const { data: detail } = useQuery({
        queryKey: ['asset', 'view', openId],
        queryFn: () => assetApi.get(openId as number),
        enabled: openId != null,
    });
    const openAsset = (a: Asset) => {
        qc.setQueryData(['asset', 'view', a.id], a);
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.set('view', String(a.id));
                return p;
            },
            { replace: true },
        );
    };
    const closeAsset = () =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.delete('view');
                return p;
            },
            { replace: true },
        );

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Asset | null>(null);
    const [transferAsset, setTransferAsset] = useState<Asset | null>(null);
    const [recallAsset, setRecallAsset] = useState<Asset | null>(null);

    const { data: summary, isLoading: summaryLoading } = useAssetSummary();
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

    // The create form is URL-driven (?add=1) so a reload / shared link reopens it; edit stays local.
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
    const openEdit = (a: Asset) => {
        // Keep ?view so closing the edit form returns to the detail drawer (bounce-back, like Access).
        setEditing(a);
        setFormOpen(true);
    };
    const closeForm = () => {
        setEditing(null);
        setFormOpen(false);
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.delete('add');
                return p;
            },
            { replace: true },
        );
    };

    // Bulk actions are locked to one status group; this maps a status to its action (null = not bulk-actionable).
    const bulkActionFor = useCallback(
        (status: AssetStatus | null): 'transfer' | 'recall' | 'force_recall' | 'receive' | null => {
            switch (status) {
                case 'ready':
                    return canTransfer ? 'transfer' : null;
                case 'pending_acceptance':
                    return canTransfer || canForceRecall ? 'recall' : null;
                case 'common':
                    return canTransfer || canForceRecall ? 'recall' : null;
                case 'deployed':
                    return canForceRecall ? 'force_recall' : null;
                case 'pending_return':
                    return canReceive ? 'receive' : null;
                default:
                    return null;
            }
        },
        [canTransfer, canReceive, canForceRecall],
    );

    const clearSelection = () => {
        setSelectedIds([]);
        setSelectionStatus(null);
    };

    // A row is tickable only if it starts (or matches) the active status group.
    const rowSelectable = (a: Asset) => (selectionStatus ? a.status === selectionStatus : bulkActionFor(a.status) != null);
    // A status that can never take part in any bulk action (e.g. written-off) shows no checkbox at all.
    const rowActionable = (a: Asset) => bulkActionFor(a.status) != null;
    // A group is locked and this row could normally be bulk-actioned, but its status differs from the
    // locked group — so it is temporarily off-limits. These rows get a lock icon + dimmed treatment
    // (as opposed to write-off rows, which are never selectable and show nothing).
    const rowLockedOut = (a: Asset) => selectionStatus != null && rowActionable(a) && a.status !== selectionStatus;

    const toggleRow = (a: Asset, on: boolean) => {
        setSelectedIds((prev) => (on ? [...new Set([...prev, a.id])] : prev.filter((x) => x !== a.id)));
        if (on) setSelectionStatus((s) => s ?? a.status);
    };

    // Reset the locked status once the selection empties.
    useEffect(() => {
        if (selectedIds.length === 0 && selectionStatus !== null) setSelectionStatus(null);
    }, [selectedIds, selectionStatus]);

    // The status group "select all" acts on: the active group, or the first bulk-actionable row.
    const eligibleStatus: AssetStatus | null = selectionStatus ?? rows.find((a) => bulkActionFor(a.status) != null)?.status ?? null;
    const groupRows = eligibleStatus ? rows.filter((a) => a.status === eligibleStatus) : [];
    const allGroupSelected = groupRows.length > 0 && groupRows.every((a) => selectedIds.includes(a.id));

    const toggleAllOnPage = (on: boolean) => {
        if (!eligibleStatus) return;
        const groupIds = groupRows.map((a) => a.id);
        setSelectedIds((prev) => (on ? [...new Set([...prev, ...groupIds])] : prev.filter((id) => !groupIds.includes(id))));
        setSelectionStatus(on ? eligibleStatus : null);
    };

    const runBulk = (op: 'writeoff') => {
        if (selectedIds.length === 0) return;
        bulk.mutate({ ids: selectedIds, op }, { onSuccess: clearSelection });
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
    // Localize the asset-type name from Master Data (categories carry both name + name_th).
    const catLabel = (type: string) => {
        const c = categories.find((x) => x.name === type);
        return c ? (lang === 'th' ? (c.name_th ?? c.name) : c.name) : type;
    };

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
                <div className="bg-card overflow-hidden rounded-xl border border-amber-500/30 shadow-xs">
                    {/* Banner: a bare amber icon anchors the return queue; "Receiving: N Unit" on the right. */}
                    <div className="flex items-center gap-3 border-b border-amber-500/25 bg-amber-500/10 px-4 py-3.5">
                        <Undo2 className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div className="text-sm font-extrabold tracking-tight">{t('asset_pending_return_title')}</div>
                        <span className="ml-auto shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-400">
                            {t('asset_receiving_count').replace('{count}', String(pendingReturns.length))}
                        </span>
                    </div>

                    {pendingReturns.map((a, i) => (
                        <div
                            key={a.id}
                            className={cn(
                                'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-amber-500/[0.06]',
                                i > 0 && 'border-border border-t',
                            )}
                        >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                <AssetTypeIcon type={a.type} className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-sm font-semibold">{a.model}</span>
                                    {a.tag && <AssetTagBadge tag={a.tag} className="shrink-0" />}
                                </div>
                                <div className="text-muted-foreground truncate font-mono text-xs">
                                    {a.asset_code}
                                    {a.owner_name ? ` · ${lang === 'th' ? 'จาก' : 'from'} ${a.owner_name}` : ''}
                                </div>
                            </div>
                            {/* Receive action: a solid amber icon button (opens the receive-to-warehouse
                                modal). Icon mirrors the header's Undo2 → received. */}
                            <button
                                type="button"
                                onClick={() => setReceiveAsset(a)}
                                title={t('asset_mark_received')}
                                aria-label={t('asset_mark_received')}
                                className={cn(
                                    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm',
                                    'transition-all duration-150 hover:bg-amber-600 hover:shadow-md',
                                    'focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-1 focus-visible:outline-none',
                                    'active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
                                )}
                            >
                                <PackageCheck className="h-[18px] w-[18px]" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <Card className="overflow-hidden">
                <div className="border-border flex gap-1 border-b px-2">
                    {(['dashboard', 'inventory', 'transfers'] as Tab[])
                        .filter((tb) => tb !== 'dashboard' || canViewDashboard)
                        .map((tb) => (
                            <button
                                key={tb}
                                onClick={() => changeTab(tb)}
                                className={cn(
                                    'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                                    tab === tb ? 'border-brand text-brand' : 'text-muted-foreground hover:text-foreground border-transparent',
                                )}
                            >
                                {tb === 'dashboard' ? t('asset_dashboard') : tb === 'inventory' ? t('asset_inventory') : t('asset_transfers')}
                            </button>
                        ))}
                </div>

                {tab === 'dashboard' && summaryLoading && <AssetDashboardSkeleton />}
                {tab === 'dashboard' && !summaryLoading && (
                    <div className="space-y-6 p-5">
                        {/* Summary stats live on the Dashboard tab. */}
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
                            <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                                <Layers className="text-muted-foreground h-4 w-4" />
                                <span className="text-sm font-semibold">{t('asset_by_type')}</span>
                            </div>
                            <div className="space-y-3.5 p-5">
                                {typeBars.map((b) => (
                                    <div key={b.type} className="flex items-center gap-3">
                                        <div className="flex w-36 shrink-0 items-center gap-2 overflow-hidden text-sm" title={catLabel(b.type)}>
                                            <AssetTypeIcon type={b.type} className="text-muted-foreground h-4 w-4 shrink-0" />
                                            <span className="truncate">{catLabel(b.type)}</span>
                                        </div>
                                        <div className="bg-secondary h-2 flex-1 overflow-hidden rounded-full">
                                            <div className="bg-brand h-full rounded-full" style={{ width: `${(b.count / maxTypeCount) * 100}%` }} />
                                        </div>
                                        <span className="w-8 shrink-0 text-right font-mono text-sm font-semibold">{b.count}</span>
                                    </div>
                                ))}
                                {typeBars.length === 0 && <div className="text-muted-foreground py-6 text-center text-sm">{t('asset_none')}</div>}
                            </div>
                        </Card>

                        <Card className="overflow-hidden">
                            <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                                <TrendingUp className="text-muted-foreground h-4 w-4" />
                                <span className="text-sm font-semibold">{t('asset_top_value')}</span>
                            </div>
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
                                                onClick={() => openAsset(a)}
                                            >
                                                <td className="text-muted-foreground px-3 py-2 font-mono text-xs">{a.asset_code}</td>
                                                <td className="px-3 py-2 font-medium">{a.model}</td>
                                                <td className="px-3 py-2">{a.owner_name}</td>
                                                <td className="px-3 py-2">
                                                    <AssetStatusBadge status={a.status} t={t} />
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-semibold">{a.value_display}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
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
                                                        label: lang === 'th' ? (c.name_th ?? c.name) : c.name,
                                                        search: `${c.name} ${c.name_th ?? ''}`,
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
                                {/* Which status group the selection is locked to — explains why other rows can't be ticked. */}
                                {selectionStatus && (
                                    <span className="border-border bg-background inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs">
                                        <AssetStatusDot status={selectionStatus} />
                                        <span className="text-muted-foreground">{t('asset_selection_only')}</span>
                                        <span className="text-foreground font-medium">{t(ASSET_STATUS_META[selectionStatus].key)}</span>
                                    </span>
                                )}
                                <button className="text-muted-foreground text-xs hover:underline" onClick={clearSelection}>
                                    {t('asset_clear')}
                                </button>
                                <div className="flex-1" />
                                {/* Contextual bulk actions per locked status group. A Common (shared)
                                    group can be re-assigned to a person (Transfer) or pulled to the pool (Recall). */}
                                {(selectionStatus === 'ready' || selectionStatus === 'common') && canTransfer && (
                                    <Button size="sm" onClick={() => setBulkDialog('transfer')}>
                                        <Share2 className="h-4 w-4" />
                                        {t('asset_transfer_action')}
                                    </Button>
                                )}
                                {/* Pending acceptance → cancel the not-yet-accepted hand-over (recall to pool). */}
                                {selectionStatus === 'pending_acceptance' && (canTransfer || canForceRecall) && (
                                    <Button size="sm" variant="outline" onClick={() => setBulkDialog('recall')}>
                                        <RefreshCcw className="h-4 w-4" />
                                        {t('asset_recall')}
                                    </Button>
                                )}
                                {selectionStatus === 'common' && (canTransfer || canForceRecall) && (
                                    <Button size="sm" variant="outline" onClick={() => setBulkDialog('recall')}>
                                        <RefreshCcw className="h-4 w-4" />
                                        {t('asset_recall_action')}
                                    </Button>
                                )}
                                {selectionStatus === 'deployed' && canForceRecall && (
                                    <Button size="sm" variant="destructive" onClick={() => setBulkDialog('recall')}>
                                        <RefreshCcw className="h-4 w-4" />
                                        {t('asset_force_recall')}
                                    </Button>
                                )}
                                {selectionStatus === 'pending_return' && canReceive && (
                                    <Button size="sm" onClick={() => setBulkDialog('receive')}>
                                        <Check className="h-4 w-4" />
                                        {t('asset_mark_received')}
                                    </Button>
                                )}
                                {/* Write-off only once back in the pool (Ready) — anything still out must be
                                    recalled / returned to Ready first. */}
                                {canRetire && selectionStatus === 'ready' && (
                                    <Button size="sm" variant="destructive" onClick={() => runBulk('writeoff')} disabled={bulk.isPending}>
                                        <FlaskConicalOff className="h-4 w-4" />
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
                                            <th
                                                className={cn('w-10 px-2 py-2.5', eligibleStatus ? 'cursor-pointer' : 'cursor-not-allowed')}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (eligibleStatus) toggleAllOnPage(!allGroupSelected);
                                                }}
                                            >
                                                <div className="flex items-center justify-center px-2 py-1.5">
                                                    <Checkbox
                                                        checked={allGroupSelected}
                                                        disabled={!eligibleStatus}
                                                        onCheckedChange={(v) => toggleAllOnPage(v === true)}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                </div>
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
                                                    onClick={() => openAsset(a)}
                                                    className={cn(
                                                        'border-border/60 cursor-pointer border-b transition-opacity last:border-0',
                                                        selectedIds.includes(a.id) ? 'bg-brand/5' : 'hover:bg-accent/40',
                                                        rowLockedOut(a) && 'opacity-55',
                                                    )}
                                                >
                                                    <td
                                                        className={cn(
                                                            'px-2 py-2.5',
                                                            rowSelectable(a) ? 'cursor-pointer' : rowActionable(a) ? 'cursor-not-allowed' : '',
                                                        )}
                                                        title={rowLockedOut(a) ? t('asset_locked_hint') : undefined}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (rowSelectable(a)) toggleRow(a, !selectedIds.includes(a.id));
                                                        }}
                                                    >
                                                        <div className="flex items-center justify-center px-2 py-1.5">
                                                            {rowLockedOut(a) ? (
                                                                // Locked out by the active status group — a lock reads far clearer than a faint checkbox.
                                                                <Lock className="text-muted-foreground/60 size-4" aria-hidden />
                                                            ) : rowActionable(a) ? (
                                                                <Checkbox
                                                                    checked={selectedIds.includes(a.id)}
                                                                    disabled={!rowSelectable(a)}
                                                                    onCheckedChange={(v) => toggleRow(a, v === true)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            ) : (
                                                                // Written-off (or other non-bulk-actionable) rows: no checkbox, keep the column width.
                                                                <span className="block size-5" aria-hidden />
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="text-muted-foreground font-mono text-xs">{a.asset_code}</div>
                                                        {a.tag && <AssetTagBadge tag={a.tag} className="mt-1 max-w-[140px]" />}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <span className="flex items-center gap-2">
                                                            <AssetTypeIcon type={a.type} className="text-muted-foreground h-4 w-4" />
                                                            {catLabel(a.type)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 font-medium">{a.model}</td>
                                                    <td className="px-4 py-2.5">{a.owner_name}</td>
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
                                                            {canEdit && a.status !== 'writeoff' && (
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
                asset={detail ?? null}
                onClose={() => closeAsset()}
                onTransfer={(a) => {
                    closeAsset();
                    setTransferAsset(a);
                }}
                onReceive={(a) => {
                    closeAsset();
                    setReceiveAsset(a);
                }}
                onRecall={(a) => {
                    closeAsset();
                    setRecallAsset(a);
                }}
                onEdit={canEdit ? openEdit : undefined}
                canTransfer={canTransfer}
                canReceive={canReceive}
                canForceRecall={canForceRecall}
                canCancelWriteoff={canCancelWriteoff}
                canDelete={canDelete}
            />
            <AssetFormDrawer open={adding || formOpen} editing={adding ? null : editing} onClose={closeForm} />
            <AssetTransferDialog asset={transferAsset} onClose={() => setTransferAsset(null)} />
            <AssetReceiveModal asset={receiveAsset} onClose={() => setReceiveAsset(null)} />
            <AssetReceiveModal mode="recall" asset={recallAsset} onClose={() => setRecallAsset(null)} />

            {/* Bulk actions on the current selection (locked to one status group) — reuse the
                single-asset dialogs in their `ids` mode. */}
            <AssetTransferDialog
                ids={selectedIds}
                open={bulkDialog === 'transfer'}
                onClose={() => setBulkDialog(null)}
                onDone={() => {
                    setBulkDialog(null);
                    clearSelection();
                }}
            />
            <AssetReceiveModal
                ids={selectedIds}
                mode="recall"
                open={bulkDialog === 'recall'}
                onClose={() => setBulkDialog(null)}
                onDone={() => {
                    setBulkDialog(null);
                    clearSelection();
                }}
            />
            <AssetReceiveModal
                ids={selectedIds}
                mode="receive"
                open={bulkDialog === 'receive'}
                onClose={() => setBulkDialog(null)}
                onDone={() => {
                    setBulkDialog(null);
                    clearSelection();
                }}
            />
        </div>
    );
}
