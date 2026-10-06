import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { useCategories, useWarehouses } from '@/modules/settings';
import { type Column, DataTable } from '@/shared/components/data-table';
import { FilterPopover } from '@/shared/components/filter-popover';
import { PageTabs } from '@/shared/components/page-tabs';
import { RecordMissingDialog } from '@/shared/components/record-missing';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge, ToneDot } from '@/shared/components/status-badge';
import { useTabParam } from '@/shared/hooks/use-tab-param';
import { cn, toRecordId } from '@/shared/lib/utils';
import type { Asset, AssetStatus, AssetSummary, AssetTransferLog, AssetType } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useUiStore } from '@/stores/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Box,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleDot,
    Clock,
    Filter,
    FlaskConicalOff,
    Layers,
    Lock,
    MapPin,
    MoreHorizontal,
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
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { assetApi } from '../api/assetApi';
import { AssetActivityCard } from '../components/asset-activity-card';
import { AssetDetailDrawer } from '../components/asset-detail-drawer';
import { AssetEventBadge } from '../components/asset-event-badge';
import { AssetFormDrawer } from '../components/asset-form-drawer';
import { Party } from '../components/asset-history-tab';
import { AssetLocationDialog } from '../components/asset-location-dialog';
import { ASSET_STATUS_META, AssetStatusBadge, AssetStatusDot, AssetTypeIcon } from '../components/asset-meta';
import { AssetReceiveModal } from '../components/asset-receive-modal';
import { AssetReturnToVendorDialog } from '../components/asset-return-to-vendor-dialog';
import { AssetTagBadge } from '../components/asset-tag-badge';
import { AssetTransferDialog } from '../components/asset-transfer-dialog';
import { AssetWriteoffDialog } from '../components/asset-writeoff-dialog';
import { useAssetMutations, useAssets, useAssetSummary, useAssetTransfers, usePendingReturns } from '../hooks/use-assets';

// The page's tabs. The active tab is mirrored in the URL (?tab=) so a reload / shared link stays put.
const TAB_IDS = ['overview', 'inventory', 'transfers'] as const;
type Tab = (typeof TAB_IDS)[number];

const isAssetTab = (v: string | null): v is Tab => (TAB_IDS as readonly string[]).includes(v ?? '');

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

/**
 * The three lifecycle buckets the "By type" bars are split into, in stack order.
 *
 * `status` is the bucket's representative status, and it is what colors the bar segment: the
 * card reads the same palette the status badges do (Settings -> Assets, so an admin who
 * recolors "Ready" recolors this chart too) instead of picking colors of its own. Anything
 * else would have the bar disagree with the badges sitting right below it on the same page.
 *
 * One list drives the legend, the bar segments and the per-row counts, so the three can
 * never fall out of step.
 */
const TYPE_BUCKETS = [
    { key: 'ready', labelKey: 'asset_bucket_ready', status: 'ready' },
    { key: 'used', labelKey: 'asset_bucket_used', status: 'deployed' },
    { key: 'writeoff', labelKey: 'asset_writeoff', status: 'writeoff' },
] as const;

/** How many types the "Assets in the system" card lists before folding the rest into one row. */
const TYPE_ROWS_SHOWN = 3;

/** Marker type of the folded row — not a category name any master data can take. */
const OTHER_TYPES = '__other__';

/** A row of that card: one type, or the folded rest (`folded` = how many types it holds). */
type TypeBar = AssetSummary['by_type'][number] & { folded?: number };

/** Sums the leftover types into the single "other" row. */
function foldTypeBars(rest: AssetSummary['by_type']): TypeBar {
    const sum = (key: 'count' | 'ready' | 'used' | 'writeoff') => rest.reduce((n, b) => n + b[key], 0);
    return {
        type: OTHER_TYPES as AssetSummary['by_type'][number]['type'],
        count: sum('count'),
        ready: sum('ready'),
        used: sum('used'),
        writeoff: sum('writeoff'),
        folded: rest.length,
    };
}

/** Pulse skeleton mirroring the dashboard layout (KPI row + card pair + table) while the summary loads. */
function AssetOverviewSkeleton() {
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
            {/* The pair stretches to one height, as the loaded cards do. */}
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="overflow-hidden">
                    <div className="border-border border-b px-5 py-3.5">
                        <div className="bg-muted h-4 w-40 animate-pulse rounded" />
                    </div>
                    {/* By type: one line per row — name, the split bar under its counts, the total —
                        for the rows shown folded (TYPE_ROWS_SHOWN and the "others" row), then the toggle. */}
                    <div className="space-y-4 p-5">
                        {Array.from({ length: TYPE_ROWS_SHOWN + 1 }).map((_, i) => (
                            <div key={i} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3rem] items-end gap-3">
                                <div className="bg-muted h-4 animate-pulse rounded" />
                                <div className="bg-muted mt-5 h-2 animate-pulse rounded-full" />
                                <div className="bg-muted ml-auto h-4 w-8 animate-pulse rounded" />
                            </div>
                        ))}
                        <div className="bg-muted mx-auto h-3 w-24 animate-pulse rounded" />
                    </div>
                </Card>
                {/* Activity chart: header with its view switch, then twelve bars of
                    staggered height so the placeholder reads as a chart, not a block. */}
                <Card className="flex flex-col overflow-hidden">
                    <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
                        <div className="bg-muted h-4 w-40 animate-pulse rounded" />
                        <div className="bg-muted h-6 w-28 animate-pulse rounded-lg" />
                    </div>
                    <div className="flex flex-1 flex-col px-5 pt-5 pb-3.5">
                        <div className="mb-2.5 flex items-center justify-between gap-3">
                            <div className="bg-muted h-3 w-48 animate-pulse rounded" />
                            <div className="bg-muted h-3 w-16 animate-pulse rounded" />
                        </div>
                        <div className="flex min-h-[172px] flex-1 items-end gap-2.5 pt-[22px]">
                            {[40, 65, 30, 80, 55, 45, 70, 35, 60, 50, 75, 90].map((h, i) => (
                                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                                    <div className="bg-muted w-full max-w-[32px] animate-pulse rounded-t-md" style={{ height: `${h}%` }} />
                                    <div className="bg-muted h-6 w-6 animate-pulse rounded" />
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            </div>
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

/**
 * Where an asset is, for the inventory's "Warehouse / Place" column: the warehouse while it sits
 * in the pool (Ready, or waiting to be received back), otherwise where it was put to use (the
 * location), falling back to the warehouse. The icon tells the two apart; the words say it to a
 * screen reader too.
 */
function AssetPlace({ asset, t }: { asset: Asset; t: (key: string) => string }) {
    const inPool = asset.status === 'ready' || asset.status === 'pending_return';
    const place = inPool
        ? { kind: 'warehouse' as const, name: asset.warehouse }
        : asset.location
          ? { kind: 'location' as const, name: asset.location }
          : { kind: 'warehouse' as const, name: asset.warehouse };
    if (!place.name) return <span className="text-muted-foreground">—</span>;
    const Icon = place.kind === 'warehouse' ? Warehouse : MapPin;
    const kindLabel = t(place.kind === 'warehouse' ? 'asset_place_warehouse' : 'asset_place_location');

    // `relative` anchors the sr-only label to this cell. Without it the label's position:absolute
    // resolves against the document (nothing up to the app's scrolling <main> is positioned), so
    // labels in lower rows stretched the page and added a second, outer scrollbar.
    return (
        <span className="relative inline-flex max-w-[12rem] items-center gap-1.5" title={`${kindLabel}: ${place.name}`}>
            <Icon className="text-muted-foreground/70 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="sr-only">{kindLabel}: </span>
            <span className="truncate">{place.name}</span>
        </span>
    );
}

/** Rows-per-page choices for the inventory table; the first is the default (left out of the URL). */
const PER_PAGE_OPTIONS = [20, 50, 100];

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
    const canViewOverview = can('assets.view_dashboard');
    // Accepting a hand-over is the recipient's action only — matched by their employee code.
    const myEmpCode = user?.employee_code ?? null;

    const [searchParams, setSearchParams] = useSearchParams();
    // The tab lives in ?tab= (useTabParam): reloads / shared links are exact, Back steps through tabs.
    const [tab, setTab] = useTabParam(isAssetTab, 'overview');
    // Unfolds the "Assets in the system" card — a way of looking at one card, so component
    // state rather than a URL parameter.
    const [showAllTypes, setShowAllTypes] = useState(false);

    const changeTab = (next: Tab) => setTab(next);

    // The Overview tab is gated by assets.view_dashboard — bounce a role without it to Inventory
    // (replace: the reader never chose Overview, so Back must not bounce them into it again).
    useEffect(() => {
        if (tab === 'overview' && !canViewOverview) {
            setTab('inventory', { replace: true });
        }
    }, [tab, canViewOverview]); // eslint-disable-line react-hooks/exhaustive-deps

    // The inventory list's search, filters and page live in the URL (?q, type, source, status,
    // warehouse, page, per), so a reload or a shared link shows the same list. Defaults are left
    // out of the URL, and every change replaces the entry (typing a search must not fill Back
    // with one step per letter). Several setters called in one handler — a filter plus "back to
    // page 1" — are merged into one URL write: separate writes would each start from the same
    // old URL and the last would undo the others.
    const pendingListParams = useRef<Record<string, string | null> | null>(null);
    const setListParams = (patch: Record<string, string | null>) => {
        const first = pendingListParams.current === null;
        pendingListParams.current = { ...(pendingListParams.current ?? {}), ...patch };
        if (!first) return;
        queueMicrotask(() => {
            const merged = pendingListParams.current ?? {};
            pendingListParams.current = null;
            setSearchParams(
                (sp) => {
                    const next = new URLSearchParams(sp);
                    for (const [key, value] of Object.entries(merged)) {
                        if (value === null || value === '') next.delete(key);
                        else next.set(key, value);
                    }
                    return next;
                },
                { replace: true },
            );
        });
    };
    const search = searchParams.get('q') ?? '';
    const typeFilter = (searchParams.get('type') ?? '') as AssetType | '';
    const sourceFilter = searchParams.get('source') ?? '';
    const statusParam = searchParams.get('status');
    const statusFilter: AssetStatus | '' = statusParam && statusParam in ASSET_STATUS_META ? (statusParam as AssetStatus) : '';
    const warehouseFilter = searchParams.get('warehouse') ?? '';
    const page = Math.max(1, Math.floor(Number(searchParams.get('page'))) || 1);
    const perPageParam = Number(searchParams.get('per'));
    const perPage = PER_PAGE_OPTIONS.includes(perPageParam) ? perPageParam : PER_PAGE_OPTIONS[0];
    const setSearch = (value: string) => setListParams({ q: value });
    const setTypeFilter = (value: AssetType | '') => setListParams({ type: value });
    const setSourceFilter = (value: string) => setListParams({ source: value });
    const setStatusFilter = (value: AssetStatus | '') => setListParams({ status: value });
    const setWarehouseFilter = (value: string) => setListParams({ warehouse: value });
    const setPage = (value: number | ((current: number) => number)) => {
        const next = typeof value === 'function' ? value(page) : value;
        setListParams({ page: next > 1 ? String(next) : null });
    };
    const setPerPage = (value: number) => setListParams({ per: value === PER_PAGE_OPTIONS[0] ? null : String(value) });
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    // Multi-select is locked to one status group; `selectionStatus` is that group.
    const [selectionStatus, setSelectionStatus] = useState<AssetStatus | null>(null);
    // Where each ticked asset came from, kept as rows are ticked (the selection spans pages, so
    // the rows themselves may no longer be loaded): Return to lessor is offered only for rented ones.
    const [selectedSource, setSelectedSource] = useState<Record<number, Asset['source']>>({});
    const [bulkDialog, setBulkDialog] = useState<null | 'transfer' | 'recall' | 'receive' | 'location' | 'writeoff' | 'returnToVendor'>(null);
    const [receiveAsset, setReceiveAsset] = useState<Asset | null>(null);
    // One asset leaving from its detail dialog — the same dialogs the bulk bar opens, for one id.
    // Closing only clears open: the id stays so the dialog keeps its content while it fades out.
    const [exitAsset, setExitAsset] = useState<{ id: number; kind: 'writeoff' | 'returnToVendor'; open: boolean } | null>(null);
    const closeExit = () => setExitAsset((e) => (e ? { ...e, open: false } : e));

    const { data: warehouses = [] } = useWarehouses();
    const { data: categories = [] } = useCategories();

    // The detail drawer is URL-driven (?view=<id>): a reload / shared link reopens it and closing
    // drops the param. Opening seeds the query cache with the clicked row so the drawer shows
    // instantly; a deep-link (id not on the current page) fetches by id. URL = single source of truth.
    const qc = useQueryClient();
    // Only a real record id opens the drawer: Number('abc') is NaN, which passes an
    // `!= null` guard and used to fetch /assets/NaN.
    const openId = toRecordId(searchParams.get('view'));
    const { data: detail, isError: detailMissing } = useQuery({
        queryKey: ['asset', 'view', openId],
        queryFn: () => assetApi.get(openId as number),
        enabled: openId != null,
    });
    /** Open the drawer for an id alone — the transfer log knows the id, not the record. */
    const openAssetId = (id: number) =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.set('view', String(id));
                return p;
            },
            { replace: true },
        );
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
    const {
        data: listData,
        isLoading,
        isFetching,
    } = useAssets({
        page,
        per_page: perPage,
        search,
        type: typeFilter || undefined,
        source: sourceFilter || undefined,
        status: statusFilter || undefined,
        warehouse: warehouseFilter || undefined,
    });
    const { accept } = useAssetMutations();
    const { data: transferLog, isLoading: transfersLoading } = useAssetTransfers();
    const transfers = transferLog?.data ?? [];
    // How far back the endpoint reaches. Only worth saying once the log is actually that long.
    const transfersCapped = !!transferLog?.meta?.limit && transfers.length >= transferLog.meta.limit;
    const { data: pendingReturns = [] } = usePendingReturns();

    // Transfer log — the same columns the asset's own History tab uses, plus the asset itself,
    // since this list spans every asset in the system.
    const transferLogColumns: Column<AssetTransferLog>[] = [
        {
            key: 'date',
            header: t('asset_hist_date'),
            render: (tr) => <span className="text-muted-foreground font-mono text-[11px] whitespace-nowrap">{tr.date ?? '—'}</span>,
        },
        {
            key: 'asset',
            header: t('asset_no'),
            render: (tr) => (
                <div className="leading-tight">
                    <span className="font-mono text-[11px] font-medium">{tr.asset_tag}</span>
                    <span className="text-muted-foreground block text-[11px]">{tr.asset_model || '—'}</span>
                </div>
            ),
        },
        { key: 'event', header: t('asset_hist_event'), render: (tr) => <AssetEventBadge kind={tr.kind} /> },
        { key: 'from', header: t('asset_hist_from'), render: (tr) => <Party label={tr.from_owner} name={tr.from_name} muted /> },
        { key: 'to', header: t('asset_hist_to'), render: (tr) => <Party label={tr.to_owner} name={tr.to_name} /> },
        { key: 'reason', header: t('asset_hist_reason'), render: (tr) => <span className="text-[13px]">{tr.reason ?? '—'}</span> },
        {
            key: 'by',
            header: t('asset_hist_by'),
            render: (tr) => <span className="text-muted-foreground text-[13px]">{tr.performed_by ?? '—'}</span>,
        },
    ];

    const rows = listData?.data ?? [];
    const meta = listData?.meta;

    // Pagination footer values with fallbacks so the footer (incl. "Rows per page") renders
    // even during the initial load on a fresh reload, when `meta` is not yet available —
    // matching the Stock/Contract tables whose footers stay visible.
    const totalRows = meta?.total ?? 0;
    const perPageDisplay = meta?.per_page ?? perPage;
    const currentPage = meta?.current_page ?? page;
    const lastPage = meta?.last_page ?? 1;

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
        (status: AssetStatus | null): 'transfer' | 'recall' | 'force_recall' | 'receive' | 'relocate' | null => {
            switch (status) {
                case 'ready':
                    return canTransfer ? 'transfer' : null;
                case 'pending_acceptance':
                    return canTransfer || canForceRecall ? 'recall' : null;
                // An asset in use can always have its location corrected (assets.edit) — that is
                // the fallback when the viewer cannot recall it, so the rows stay tickable.
                case 'common':
                    return canTransfer || canForceRecall ? 'recall' : canEdit ? 'relocate' : null;
                case 'deployed':
                    return canForceRecall ? 'force_recall' : canEdit ? 'relocate' : null;
                case 'pending_return':
                    return canReceive ? 'receive' : null;
                default:
                    return null;
            }
        },
        [canTransfer, canReceive, canForceRecall, canEdit],
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
        if (on) setSelectedSource((prev) => ({ ...prev, [a.id]: a.source }));
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
        if (on) setSelectedSource((prev) => ({ ...prev, ...Object.fromEntries(groupRows.map((a) => [a.id, a.source])) }));
        setSelectionStatus(on ? eligibleStatus : null);
    };
    const allSelectedRented = selectedIds.length > 0 && selectedIds.every((id) => selectedSource[id] === 'rented');

    // Loading rows show while any fetch runs (a page, filter or search change keeps the previous
    // page as placeholder data, which would otherwise sit there looking current).
    const tableLoading = isLoading || isFetching;
    const searchRef = useRef<HTMLInputElement>(null);
    const filterIdBase = useId();
    const filterIds = {
        type: `${filterIdBase}-type`,
        source: `${filterIdBase}-source`,
        status: `${filterIdBase}-status`,
        warehouse: `${filterIdBase}-warehouse`,
    };
    const perPageLabelId = `${filterIdBase}-per-page`;
    const numberFormat = useMemo(() => new Intl.NumberFormat(lang === 'th' ? 'th-TH' : 'en-US'), [lang]);
    const formatCount = (n: number) => numberFormat.format(n);
    const selectionCountText = t('asset_selected_count').replace('{n}', formatCount(selectedIds.length));

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

    // The card grows a row per category, and categories are master data an admin can keep
    // adding to — so it shows the biggest few and folds the rest into one "other" row, which
    // keeps every asset in the picture at a fixed height. Folding only pays off from two
    // leftover types up; a single one is shown as itself. The list arrives sorted by count.
    const allTypeBars = summary?.by_type ?? [];
    const foldTypes = !showAllTypes && allTypeBars.length > TYPE_ROWS_SHOWN + 1;
    const typeBars: TypeBar[] = foldTypes
        ? [...allTypeBars.slice(0, TYPE_ROWS_SHOWN), foldTypeBars(allTypeBars.slice(TYPE_ROWS_SHOWN))]
        : allTypeBars;
    // Same status palette the badges use, so the chart and the table below it agree.
    const statusColors = useUiStore((s) => s.assetStatusColors);
    // Localize the asset-type name from Master Data (categories carry both name + name_th).
    const catLabel = (type: string) => {
        const c = categories.find((x) => x.name === type);
        return c ? (lang === 'th' ? (c.name_th ?? c.name) : c.name) : type;
    };
    // Spoken/hover description of a bar — the row's counts are marked by color alone, so the
    // written-out split is what a screen reader and a hover both get.
    const typeLabel = (b: TypeBar) => (b.type === OTHER_TYPES ? t('asset_type_others').replace('{n}', String(b.folded ?? 0)) : catLabel(b.type));
    const typeBarTitle = (b: TypeBar) => `${typeLabel(b)}: ${TYPE_BUCKETS.map((s) => `${b[s.key]} ${t(s.labelKey)}`).join(', ')}`;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('assets_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('assets_sub')}</p>
                </div>
                <div className="flex gap-2">
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
                <PageTabs
                    tabs={(['overview', 'inventory', 'transfers'] as Tab[])
                        .filter((tb) => tb !== 'overview' || canViewOverview)
                        .map((tb) => ({
                            id: tb,
                            label: tb === 'overview' ? t('asset_overview') : tb === 'inventory' ? t('asset_inventory') : t('asset_transfers'),
                        }))}
                    active={tab}
                    onChange={changeTab}
                />

                {tab === 'overview' && summaryLoading && <AssetOverviewSkeleton />}
                {tab === 'overview' && !summaryLoading && (
                    <div className="space-y-6 p-5">
                        {/* Summary stats live on the Overview tab. */}
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

                        {/* The two cards stand the same height: the row stretches both to the taller,
                            and the activity chart grows into whatever height "By type" takes —
                            folded or opened to every category. */}
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card className="overflow-hidden">
                                <div className="border-border flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3.5">
                                    <div className="flex items-center gap-2">
                                        <Layers className="text-muted-foreground h-4 w-4" />
                                        <span className="text-sm font-semibold">{t('asset_by_type')}</span>
                                    </div>
                                    {/* Legend — the one place the three colors are named (the counts over the bars
                                        wear them), then what the number closing each row is. */}
                                    <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
                                        {TYPE_BUCKETS.map((s) => (
                                            <span key={s.key} className="text-muted-foreground flex items-center gap-1.5 text-xs">
                                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: statusColors[s.status] }} />
                                                {t(s.labelKey)}
                                            </span>
                                        ))}
                                        <span className="text-muted-foreground border-border border-l pl-3 text-xs">{t('asset_types_total')}</span>
                                    </div>
                                </div>
                                <div className="space-y-4 p-5">
                                    {typeBars.map((b) => (
                                        // One line per type: icon + name, the bar with each bucket's count over its
                                        // piece, then the total — name and total sit level with the bar itself.
                                        <div key={b.type} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3rem] items-end gap-3">
                                            <div className="flex min-w-0 items-center gap-2 text-sm leading-none" title={typeLabel(b)}>
                                                {b.type === OTHER_TYPES ? (
                                                    <MoreHorizontal className="text-muted-foreground h-4 w-4 shrink-0" />
                                                ) : (
                                                    <AssetTypeIcon type={b.type} className="text-muted-foreground h-4 w-4 shrink-0" />
                                                )}
                                                <span className="truncate">{typeLabel(b)}</span>
                                            </div>
                                            {/* A full-width bar per type, split by its own total — as the reports' IT staff
                                                card draws a person's split — with each bucket's count over its piece. Measured
                                                against the biggest type, a single write-off beside hundreds in use came out
                                                narrower than a pixel. An empty bucket draws nothing. */}
                                            <div role="img" aria-label={typeBarTitle(b)} title={typeBarTitle(b)}>
                                                <div className="flex h-4 items-end">
                                                    {TYPE_BUCKETS.filter((s) => b[s.key] > 0).map((s) => (
                                                        <span
                                                            key={s.key}
                                                            className="flex shrink-0 justify-center font-mono text-xs leading-none font-semibold whitespace-nowrap"
                                                            style={{
                                                                width: `${(b[s.key] / Math.max(1, b.count)) * 100}%`,
                                                                color: statusColors[s.status],
                                                            }}
                                                        >
                                                            {b[s.key]}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="bg-secondary mt-1 flex h-2 overflow-hidden rounded-full">
                                                    {TYPE_BUCKETS.filter((s) => b[s.key] > 0).map((s) => (
                                                        <div
                                                            key={s.key}
                                                            // Never thinner than 3px, so 3 written off among a thousand still shows.
                                                            className="min-w-[3px]"
                                                            style={{
                                                                width: `${(b[s.key] / Math.max(1, b.count)) * 100}%`,
                                                                backgroundColor: statusColors[s.status],
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            <span className="text-right font-mono text-sm leading-none font-semibold">{b.count}</span>
                                        </div>
                                    ))}
                                    {typeBars.length === 0 && <div className="text-muted-foreground py-6 text-center text-sm">{t('asset_none')}</div>}
                                    {allTypeBars.length > TYPE_ROWS_SHOWN + 1 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowAllTypes((v) => !v)}
                                            aria-expanded={showAllTypes}
                                            className="text-muted-foreground hover:text-foreground mx-auto flex items-center gap-1 text-xs font-medium transition-colors [@media(pointer:coarse)]:py-2"
                                        >
                                            {showAllTypes
                                                ? t('asset_types_show_less')
                                                : t('asset_types_show_all').replace('{n}', String(allTypeBars.length))}
                                            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAllTypes && 'rotate-180')} />
                                        </button>
                                    )}
                                </div>
                            </Card>

                            <AssetActivityCard data={summary?.activity_12m ?? []} />
                        </div>

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
                                                    <AssetStatusBadge status={a.status} t={t} returned={!!a.returned_to_vendor_at} />
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
                                <Search
                                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                                    aria-hidden="true"
                                />
                                <Input
                                    ref={searchRef}
                                    type="search"
                                    aria-label={t('asset_search_label')}
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
                                            <label
                                                htmlFor={filterIds.type}
                                                className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium"
                                            >
                                                <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                                                {t('asset_type')}
                                            </label>
                                            <SearchableSelect
                                                id={filterIds.type}
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
                                            <label
                                                htmlFor={filterIds.source}
                                                className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium"
                                            >
                                                <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                                                {t('asset_source_filter')}
                                            </label>
                                            <SearchableSelect
                                                id={filterIds.source}
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
                                            <label
                                                htmlFor={filterIds.status}
                                                className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium"
                                            >
                                                <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />
                                                {t('asset_status')}
                                            </label>
                                            <SearchableSelect
                                                id={filterIds.status}
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
                                            <label
                                                htmlFor={filterIds.warehouse}
                                                className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium"
                                            >
                                                <Warehouse className="h-3.5 w-3.5" aria-hidden="true" />
                                                {t('asset_warehouse')}
                                            </label>
                                            <SearchableSelect
                                                id={filterIds.warehouse}
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
                                        aria-label={`${t('remove_filter')}: ${c.label}`}
                                        onClick={() => {
                                            c.clear();
                                            setPage(1);
                                            searchRef.current?.focus();
                                        }}
                                        className="bg-brand/10 text-brand hover:bg-brand/20 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                                    >
                                        {c.label}
                                        <X className="h-3 w-3" aria-hidden="true" />
                                    </button>
                                ))}
                            </div>
                        )}

                        <div role="status" aria-live="polite" className="sr-only">
                            {selectedIds.length > 0 ? selectionCountText : ''}
                        </div>
                        {selectedIds.length > 0 && (
                            <div className="bg-brand/5 border-border flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-2.5">
                                <span className="text-brand text-sm font-semibold">{selectionCountText}</span>
                                {/* Which status group the selection is locked to — explains why other rows can't be ticked. */}
                                {selectionStatus && (
                                    <span className="border-border bg-background inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs">
                                        <AssetStatusDot status={selectionStatus} />
                                        <span className="text-muted-foreground">{t('asset_selection_only')}</span>
                                        <span className="text-foreground font-medium">{t(ASSET_STATUS_META[selectionStatus].key)}</span>
                                    </span>
                                )}
                                <button
                                    type="button"
                                    className="text-muted-foreground rounded px-1 py-1 text-xs hover:underline"
                                    onClick={clearSelection}
                                >
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
                                {/* A desk move: the holder keeps the asset, only the place changes. Offered
                                    for both in-use groups and gated by assets.edit, not assets.transfer. */}
                                {(selectionStatus === 'deployed' || selectionStatus === 'common') && canEdit && (
                                    <Button size="sm" variant="outline" onClick={() => setBulkDialog('location')}>
                                        <MapPin className="h-4 w-4" />
                                        {t('asset_location_update')}
                                    </Button>
                                )}
                                {/* Write-off only once back in the pool (Ready) — anything still out must be
                                    recalled / returned to Ready first. */}
                                {/* A rented asset goes back to its lessor through its own action (same permission as
                                    a write-off), so the return is recorded as such — not as a reason anyone could rename. */}
                                {canRetire && selectionStatus === 'ready' && allSelectedRented && (
                                    <Button size="sm" variant="outline" onClick={() => setBulkDialog('returnToVendor')}>
                                        <Undo2 className="h-4 w-4" />
                                        {t('asset_return_vendor')}
                                    </Button>
                                )}
                                {canRetire && selectionStatus === 'ready' && (
                                    <Button size="sm" variant="destructive" onClick={() => setBulkDialog('writeoff')}>
                                        <FlaskConicalOff className="h-4 w-4" />
                                        {t('asset_writeoff')}
                                    </Button>
                                )}
                            </div>
                        )}

                        <div className="border-border overflow-hidden rounded-xl border">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm" aria-label={t('asset_inventory_table')} aria-busy={tableLoading}>
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
                                                        aria-label={t('asset_select_page_group')}
                                                        checked={allGroupSelected}
                                                        disabled={!eligibleStatus}
                                                        onCheckedChange={(v) => toggleAllOnPage(v === true)}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                </div>
                                            </th>
                                            <th className="px-4 py-2.5">{t('asset_col_code_tag')}</th>
                                            <th className="px-4 py-2.5">{t('asset_col_brand_model')}</th>
                                            <th className="px-4 py-2.5">{t('asset_type')}</th>
                                            <th className="px-4 py-2.5">{t('asset_col_serial')}</th>
                                            <th className="px-4 py-2.5">{t('asset_col_holder_dept')}</th>
                                            <th className="px-4 py-2.5">{t('asset_col_place')}</th>
                                            <th className="px-4 py-2.5">{t('asset_status')}</th>
                                            <th className="px-4 py-2.5 text-right">{t('asset_value')}</th>
                                            <th className="px-4 py-2.5 text-right">{t('asset_actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tableLoading ? (
                                            Array.from({ length: 8 }).map((_, r) => (
                                                <tr key={`skeleton-${r}`} aria-hidden="true" className="border-border/60 border-b last:border-0">
                                                    {Array.from({ length: 10 }).map((_, c) => (
                                                        <td key={c} className="px-4 py-2.5">
                                                            <div className="bg-muted h-4 w-3/4 max-w-[160px] rounded motion-safe:animate-pulse" />
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))
                                        ) : rows.length === 0 ? (
                                            <tr>
                                                <td colSpan={10} className="text-muted-foreground px-4 py-16 text-center text-sm">
                                                    {hasActiveFilters ? (
                                                        <div className="flex flex-col items-center gap-3">
                                                            {t('asset_none_filtered')}
                                                            <Button size="sm" variant="outline" onClick={clearFilters}>
                                                                <X className="h-4 w-4" aria-hidden="true" />
                                                                {t('reset_filters')}
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        t('asset_none')
                                                    )}
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
                                                        rowLockedOut(a) && 'bg-muted/40',
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
                                                                // Locked out by the active status group — a lock reads far clearer than a faint
                                                                // checkbox; it carries the reason for screen readers too (the title is mouse-only).
                                                                <Lock
                                                                    className="text-muted-foreground size-4"
                                                                    role="img"
                                                                    aria-label={t('asset_locked_hint')}
                                                                />
                                                            ) : rowActionable(a) ? (
                                                                <Checkbox
                                                                    aria-label={`${t('asset_select_row')} ${a.asset_code}`}
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
                                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openAsset(a);
                                                            }}
                                                            aria-label={`${t('asset_open_detail')} ${a.asset_code}`}
                                                            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded font-mono text-xs underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-hidden"
                                                        >
                                                            {a.asset_code}
                                                        </button>
                                                        {a.tag && <AssetTagBadge tag={a.tag} className="mt-1 max-w-[140px]" />}
                                                    </td>
                                                    {/* Brand over model: "Latitude 5440" alone does not say Dell. */}
                                                    <td className="max-w-[14rem] px-4 py-2.5">
                                                        {a.brand && (
                                                            <div className="text-muted-foreground truncate text-xs" title={a.brand}>
                                                                {a.brand}
                                                            </div>
                                                        )}
                                                        <div className="truncate font-medium" title={a.model ?? undefined}>
                                                            {a.model ?? '—'}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <span className="flex items-center gap-2 whitespace-nowrap">
                                                            <AssetTypeIcon
                                                                type={a.type}
                                                                className="text-muted-foreground h-4 w-4"
                                                                aria-hidden="true"
                                                            />
                                                            {catLabel(a.type)}
                                                        </span>
                                                    </td>
                                                    {/* What IT reads off the sticker; the search already matches it. */}
                                                    <td
                                                        className="max-w-[10rem] truncate px-4 py-2.5 font-mono text-xs"
                                                        title={a.serial ?? undefined}
                                                    >
                                                        {a.serial || <span className="text-muted-foreground">—</span>}
                                                    </td>
                                                    {/* Holder with their department under it (the department alone was a column
                                                        empty for every pool and shared asset). */}
                                                    <td className="max-w-[12rem] px-4 py-2.5">
                                                        {a.owner_name ? (
                                                            <>
                                                                <div className="truncate" title={a.owner_name}>
                                                                    {a.owner_name}
                                                                </div>
                                                                {a.department && (
                                                                    <div className="text-muted-foreground truncate text-xs" title={a.department}>
                                                                        {a.department}
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="text-muted-foreground">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <AssetPlace asset={a} t={t} />
                                                    </td>
                                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                                        <AssetStatusBadge status={a.status} t={t} returned={!!a.returned_to_vendor_at} />
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-mono text-xs whitespace-nowrap tabular-nums">
                                                        {a.source === 'rented' ? (
                                                            // The contract's rent is for the whole contract — repeated on every unit it read as
                                                            // each one's value. Name the contract instead.
                                                            <StatusBadge tone="violet" dot={false} className="font-sans">
                                                                {a.contract_code
                                                                    ? `${t('asset_rented_badge')} · ${a.contract_code}`
                                                                    : t('asset_rented_badge')}
                                                            </StatusBadge>
                                                        ) : (
                                                            a.value_display
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center justify-end gap-1">
                                                            {a.status === 'pending_acceptance' && !!myEmpCode && a.owner === myEmpCode && (
                                                                <button
                                                                    className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md text-emerald-600"
                                                                    type="button"
                                                                    title={t('asset_accept')}
                                                                    aria-label={t('asset_accept')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        accept.mutate(a.id);
                                                                    }}
                                                                >
                                                                    <Check className="h-4 w-4" aria-hidden="true" />
                                                                </button>
                                                            )}
                                                            {canReceive && a.status === 'pending_return' && (
                                                                <button
                                                                    className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md text-emerald-600"
                                                                    type="button"
                                                                    title={t('asset_mark_received')}
                                                                    aria-label={t('asset_mark_received')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setReceiveAsset(a);
                                                                    }}
                                                                >
                                                                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                                                </button>
                                                            )}
                                                            {canTransfer && a.status === 'ready' && (
                                                                <button
                                                                    className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md"
                                                                    type="button"
                                                                    title={t('transfer_asset')}
                                                                    aria-label={t('transfer_asset')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setTransferAsset(a);
                                                                    }}
                                                                >
                                                                    <Share2 className="h-4 w-4" aria-hidden="true" />
                                                                </button>
                                                            )}
                                                            {canEdit && a.status !== 'writeoff' && (
                                                                <button
                                                                    className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md"
                                                                    type="button"
                                                                    title={t('edit_asset')}
                                                                    aria-label={t('edit_asset')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openEdit(a);
                                                                    }}
                                                                >
                                                                    <SquarePen className="h-4 w-4" aria-hidden="true" />
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
                                <span id={perPageLabelId}>{t('asset_rows_per_page')}</span>
                                <Select
                                    value={String(perPage)}
                                    onValueChange={(v) => {
                                        setPerPage(Number(v));
                                        setPage(1);
                                    }}
                                >
                                    <SelectTrigger className="h-8 w-[72px]" aria-labelledby={perPageLabelId}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PER_PAGE_OPTIONS.map((n) => (
                                            <SelectItem key={n} value={String(n)}>
                                                {n}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center gap-3">
                                <span role="status" aria-live="polite" className="tabular-nums">
                                    {formatCount(totalRows === 0 ? 0 : (currentPage - 1) * perPageDisplay + 1)}–
                                    {formatCount(Math.min(currentPage * perPageDisplay, totalRows))} {t('asset_of')} {formatCount(totalRows)}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        aria-label={t('asset_prev_page')}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page <= 1}
                                        className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                                    >
                                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                    <span className="text-foreground px-1 font-medium tabular-nums">
                                        {formatCount(currentPage)} / {formatCount(lastPage)}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={t('asset_next_page')}
                                        onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                                        disabled={page >= lastPage}
                                        className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                                    >
                                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'transfers' && (
                    <div className="space-y-3 p-5 [--row-py:0.3125rem]">
                        <DataTable
                            columns={transferLogColumns}
                            rows={transfers}
                            rowKey={(tr) => tr.id}
                            rowHeight={32}
                            loading={transfersLoading}
                            // One box answers "what happened to INK-IT-014" and "what did Somchai
                            // hand back" — the questions this log is opened with.
                            searchable={(tr) =>
                                `${tr.asset_tag} ${tr.asset_model ?? ''} ${tr.from_name ?? ''} ${tr.from_owner ?? ''} ${tr.to_name ?? ''} ${tr.to_owner} ${tr.performed_by ?? ''}`
                            }
                            onRowClick={(tr) => tr.asset_id && openAssetId(tr.asset_id)}
                        />
                        {/* The endpoint stops at a fixed number of rows. Saying so beats a footer
                            that reads "1-20 of 100" as though 100 were everything there ever was. */}
                        {transfersCapped && (
                            <p className="text-muted-foreground text-xs">{t('asset_log_capped').replace('{n}', String(transfers.length))}</p>
                        )}
                    </div>
                )}
            </Card>

            {/* The drawer bails out on a null record, so a dead ?view= link had nothing to
                render and said nothing. This says it instead. */}
            <RecordMissingDialog open={detailMissing} onClose={() => closeAsset()} />
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
                onWriteoff={(a) => {
                    closeAsset();
                    setExitAsset({ id: a.id, kind: 'writeoff', open: true });
                }}
                onReturnToVendor={(a) => {
                    closeAsset();
                    setExitAsset({ id: a.id, kind: 'returnToVendor', open: true });
                }}
                canRetire={canRetire}
                canUpdateLocation={canEdit}
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
            <AssetLocationDialog
                ids={selectedIds}
                open={bulkDialog === 'location'}
                onClose={() => setBulkDialog(null)}
                onDone={() => {
                    setBulkDialog(null);
                    clearSelection();
                }}
            />
            <AssetReturnToVendorDialog
                ids={exitAsset ? [exitAsset.id] : []}
                open={!!exitAsset?.open && exitAsset.kind === 'returnToVendor'}
                onClose={closeExit}
                onDone={closeExit}
            />
            <AssetWriteoffDialog
                ids={exitAsset ? [exitAsset.id] : []}
                open={!!exitAsset?.open && exitAsset.kind === 'writeoff'}
                onClose={closeExit}
                onDone={closeExit}
            />
            <AssetReturnToVendorDialog
                ids={selectedIds}
                open={bulkDialog === 'returnToVendor'}
                onClose={() => setBulkDialog(null)}
                onDone={() => {
                    setBulkDialog(null);
                    clearSelection();
                }}
            />
            <AssetWriteoffDialog
                ids={selectedIds}
                open={bulkDialog === 'writeoff'}
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
