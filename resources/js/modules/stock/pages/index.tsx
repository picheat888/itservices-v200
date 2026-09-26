import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { useCategories, useCurrency, useWarehouses } from '@/modules/settings';
import { Column, DataTable } from '@/shared/components/data-table';
import { FilterPopover } from '@/shared/components/filter-popover';
import { PageTabs } from '@/shared/components/page-tabs';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge, ToneDot } from '@/shared/components/status-badge';
import { refusalReason } from '@/shared/lib/api-errors';
import { readTabParam } from '@/shared/lib/tab-param';
import { cn, toRecordId } from '@/shared/lib/utils';
import type { StockItem, StockItemStatus, StockMovementType } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Input } from '@/shared/ui/input';
import {
    AlertTriangle,
    Archive,
    ArrowDownToLine,
    ArrowLeftRight,
    ArrowUpDown,
    Boxes,
    CircleDot,
    FilePlus2,
    Plus,
    RotateCcw,
    Search,
    Send,
    SquarePen,
    Tag,
    Trash2,
    Warehouse,
    X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MovementDrawer } from '../components/movement-drawer';
import { RequestDrawer } from '../components/request-drawer';
import { StockItemDetailModal } from '../components/stock-item-detail-modal';
import { StockItemModal } from '../components/stock-item-modal';
import { useStockCounts, useStockItemMutations, useStockItemsPage, useStockRequests, useStockSummary } from '../hooks/use-stock';
import { AuditTab } from './tabs/counting-tab';
import { MovementsTab } from './tabs/movements-tab';
import { OverviewTab } from './tabs/overview-tab';
import { RequestsTab } from './tabs/requests-tab';

// The page's tabs. The active tab is mirrored in the URL (?tab=) so a reload / shared link stays put.
const STOCK_TABS = ['overview', 'items', 'movements', 'requests', 'audit'] as const;
type StockTab = (typeof STOCK_TABS)[number];

// localStorage key for the Items-tab filters (search + category + warehouse + status).
// Kept out of the URL so personal filters survive a reload without cluttering shareable links.
const STOCK_FILTER_KEY = 'stock.item-filters';

const STATUS_TONE: Record<StockItemStatus, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
    ok: 'green',
    low: 'amber',
    out: 'red',
    over: 'blue',
    dead: 'gray',
};

// Fixed screen anchors for the min/max gridlines — identical on every row so the
// markers (and their labels) line up vertically down the whole Stock items table.
const BAR_MIN_X = 20;
const BAR_MAX_X = 80;

/** Visual Min/Max bar (bullet-chart style). The min/max gridlines are pinned at
 *  fixed positions so they align across rows; the current value is mapped onto the
 *  low (0..min) / healthy (min..max) / over (max..) zones via piecewise scaling. */
function StockBar({ item }: { item: StockItem }) {
    const { min_stock: min, max_stock: max, current_stock: cur } = item;

    // Map the current value to a screen percentage so that `min` always lands on
    // BAR_MIN_X and `max` always on BAR_MAX_X, regardless of the row's actual values.
    let curPct: number;
    if (cur <= min) {
        curPct = min > 0 ? (cur / min) * BAR_MIN_X : 0;
    } else if (cur <= max) {
        curPct = BAR_MIN_X + ((cur - min) / Math.max(1, max - min)) * (BAR_MAX_X - BAR_MIN_X);
    } else {
        const over = (cur - max) / Math.max(1, max - min);
        curPct = Math.min(100, BAR_MAX_X + over * (100 - BAR_MAX_X));
    }

    const fill =
        item.status === 'out' || item.status === 'low'
            ? 'bg-destructive'
            : item.status === 'over'
              ? 'bg-blue-500'
              : item.status === 'dead'
                ? 'bg-muted-foreground'
                : 'bg-emerald-500';
    return (
        <div className="w-full min-w-[160px] pb-0.5">
            <div className="bg-muted relative h-1.5 w-full rounded-full">
                {/* Healthy band between the fixed min and max gridlines. */}
                <div
                    className="absolute inset-y-0 rounded-full bg-emerald-500/20"
                    style={{ left: `${BAR_MIN_X}%`, width: `${BAR_MAX_X - BAR_MIN_X}%` }}
                />
                <div className="absolute -inset-y-0.5 w-px bg-amber-500" style={{ left: `${BAR_MIN_X}%` }} />
                <div className="absolute -inset-y-0.5 w-px bg-blue-500" style={{ left: `${BAR_MAX_X}%` }} />
                <div className={cn('absolute inset-y-0 left-0 rounded-full', fill)} style={{ width: `${curPct}%` }} />
            </div>
            {/* Min / Max labels sit under the fixed gridlines → aligned across all rows. */}
            <div className="relative mt-1 h-3 font-mono text-[10px]">
                <span className="absolute -translate-x-1/2 whitespace-nowrap text-amber-600" style={{ left: `${BAR_MIN_X}%` }}>
                    {min}
                </span>
                <span className="absolute -translate-x-1/2 whitespace-nowrap text-blue-600" style={{ left: `${BAR_MAX_X}%` }}>
                    {max}
                </span>
            </div>
        </div>
    );
}

/** Attention-grabbing double-blink (+ slight zoom) for the alert-banner icon. */
const stockBlinkStyles = `
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

/** Alert banner shown when any items are in a warning state. Displays real item data grouped by type. */
function AlertCard({
    summary,
    t,
    onViewItems,
}: {
    summary: import('@/shared/types').StockSummary;
    t: ReturnType<typeof useT>;
    onViewItems: () => void;
}) {
    const hasCritical = summary.out_count > 0 || summary.low_count > 0;
    return (
        <Card className={cn('border p-4', hasCritical ? 'border-destructive/40 bg-destructive/5' : 'border-amber-500/40 bg-amber-500/5')}>
            <style>{stockBlinkStyles}</style>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span
                        className={cn(
                            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                            hasCritical ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600',
                        )}
                    >
                        <AlertTriangle className="cf-blink h-5 w-5" />
                    </span>
                    <div>
                        <div className="font-semibold">{t('stock_minmax_alerts')}</div>
                        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
                            {[
                                summary.out_count > 0 && (
                                    <span key="out" className="text-destructive font-medium">
                                        {summary.out_count} {t('stock_alert_out')}
                                    </span>
                                ),
                                summary.low_count > 0 && (
                                    <span key="low" className="font-medium text-amber-600">
                                        {summary.low_count} {t('stock_alert_low')}
                                    </span>
                                ),
                                summary.over_count > 0 && (
                                    <span key="over" className="font-medium text-blue-600">
                                        {summary.over_count} {t('stock_alert_over')}
                                    </span>
                                ),
                                summary.dead_count > 0 && (
                                    <span key="dead" className="text-muted-foreground font-medium">
                                        {summary.dead_count} {t('stock_alert_dead')}
                                    </span>
                                ),
                            ]
                                .filter(Boolean)
                                .reduce<React.ReactNode[]>(
                                    (acc, el, i) =>
                                        i === 0
                                            ? [el]
                                            : [
                                                  ...acc,
                                                  <span key={`sep-${i}`} className="text-muted-foreground/50">
                                                      |
                                                  </span>,
                                                  el,
                                              ],
                                    [],
                                )}
                        </div>
                    </div>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={onViewItems}>
                    {t('stock_view_items')}
                </Button>
            </div>
        </Card>
    );
}

export default function StockPage() {
    const t = useT();
    const confirm = useConfirm();
    // Every gate on this page lives under the stock.* prefix, so it is added here
    // and the call sites below stay short.
    const { can: hasPermission } = useAuth();
    const can = (p: string) => hasPermission(`stock.${p}`);
    const canManage = can('manage_items');

    const [searchParams, setSearchParams] = useSearchParams();
    // Resolve the starting tab from the URL (?tab=) so reloads / shared links are exact; otherwise the dashboard.
    const isStockTab = (v: string | null): v is StockTab => STOCK_TABS.includes(v as StockTab);
    const urlTab = readTabParam(searchParams.get('tab'));
    const initialTab: StockTab = isStockTab(urlTab) ? urlTab : 'overview';
    const [tab, setTab] = useState<StockTab>(initialTab);

    // Switch tab and mirror it in the URL (?tab=) so reloads / shared links stay put.
    const changeTab = useCallback(
        (next: StockTab) => {
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

    // Restore the last-used Items-tab filters so a reload lands on the same view.
    const savedFilters = useMemo<{ search?: string; cat?: string; wh?: string; status?: string; sort?: string }>(() => {
        try {
            return JSON.parse(localStorage.getItem(STOCK_FILTER_KEY) || '{}');
        } catch {
            return {};
        }
    }, []);
    // Default sort for the Items table — alphabetical by name.
    const DEFAULT_ITEM_SORT = 'name_asc';
    const [search, setSearch] = useState(savedFilters.search ?? '');
    const [cat, setCat] = useState(savedFilters.cat ?? 'all');
    const [wh, setWh] = useState(savedFilters.wh ?? 'all');
    const [statusFilter, setStatusFilter] = useState(savedFilters.status ?? 'all');
    const [itemSort, setItemSort] = useState(savedFilters.sort ?? DEFAULT_ITEM_SORT);

    // Persist the Items-tab filters across reloads.
    useEffect(() => {
        localStorage.setItem(STOCK_FILTER_KEY, JSON.stringify({ search, cat, wh, status: statusFilter, sort: itemSort }));
    }, [search, cat, wh, statusFilter, itemSort]);
    const [editItem, setEditItem] = useState<StockItem | null>(null);
    // Item detail is URL-driven (?view=<id>) so a reload / shared link reopens it; closing drops it.
    // Only a real record id opens the modal: Number('abc') is NaN, which passes an
    // `!= null` guard and used to fetch /stock-items/NaN.
    const viewId = toRecordId(searchParams.get('view'));
    const setViewId = (id: number | null) =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                if (id == null) {
                    p.delete('view');
                } else {
                    p.set('view', String(id));
                }
                return p;
            },
            { replace: true },
        );
    // The add-item drawer is URL-driven (?add=1) so a reload / shared link reopens it; edit stays local.
    const adding = searchParams.get('add') != null;
    const openAdd = () =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.set('add', '1');
                return p;
            },
            { replace: true },
        );
    const closeAdd = () =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.delete('add');
                return p;
            },
            { replace: true },
        );
    const [moveKind, setMoveKind] = useState<StockMovementType | null>(null);
    const [reqOpen, setReqOpen] = useState(false);

    const { data: summary } = useStockSummary();
    const { data: categories = [] } = useCategories();
    const { data: warehouses = [] } = useWarehouses();
    // Server-side pagination for the Items table.
    const [itemsPage, setItemsPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    // Reset to page 1 whenever a filter/sort/search changes (the result set changes).
    useEffect(() => {
        setItemsPage(1);
    }, [search, cat, wh, statusFilter, itemSort]);

    const {
        data: itemsPageData,
        isLoading: itemsLoading,
        isFetching: itemsFetching,
    } = useStockItemsPage({
        search: search || undefined,
        category: cat === 'all' ? undefined : cat,
        warehouse: wh === 'all' ? undefined : wh,
        status: statusFilter === 'all' ? undefined : statusFilter,
        sort: itemSort,
        page: itemsPage,
        per_page: itemsPerPage,
    });
    const items = itemsPageData?.data ?? [];
    const itemsTotal = itemsPageData?.meta.total ?? 0;

    const { data: requestsPage } = useStockRequests();
    const pendingRequests = requestsPage?.meta.pending ?? 0;
    // Outstanding work = awaiting approval (pending) + awaiting fulfillment (approved).
    const outstandingRequests = requestsPage?.meta.outstanding ?? 0;
    // Requests-tab pagination lives here (not in the tab) so it survives switching tabs.
    const [reqPage, setReqPage] = useState(1);
    const [reqPerPage, setReqPerPage] = useState(20);

    // Outstanding counting work = draft (not-yet-committed) count sessions.
    const { data: countsPage } = useStockCounts({}, can('view_count'));
    const draftCounts = countsPage?.meta.draft ?? 0;

    const { remove } = useStockItemMutations();

    // Delete an empty SKU after a confirm. Only items with 0 on-hand and 0 value are
    // deletable (the button is disabled otherwise); the server enforces this too, and
    // refuses again for a SKU that has ever moved — the dialog stays open and says so
    // rather than failing with the generic message.
    const confirmDelete = async (i: StockItem) => {
        await confirm({
            variant: 'danger',
            title: t('stock_delete_item'),
            description: t('stock_delete_confirm'),
            entity: { name: i.name, sub: i.sku },
            action: () => remove.mutateAsync(i.id),
            errorMessage: (e) => {
                const refusal = refusalReason(e);
                if (refusal?.reason !== 'has_history') return undefined;
                return t('stock_delete_has_history').replace('{count}', String(refusal.body.movements_count ?? 0));
            },
        });
    };

    const { format, formatCompact } = useCurrency();

    const statusBadge = (s: StockItemStatus) => <StatusBadge tone={STATUS_TONE[s]}>{t(`stock_st_${s}` as Parameters<typeof t>[0])}</StatusBadge>;

    const columns: Column<StockItem>[] = [
        { key: 'sku', header: 'SKU', render: (i) => <span className="font-mono text-xs">{i.sku}</span> },
        {
            key: 'name',
            header: t('stock_item'),
            render: (i) => (
                <div>
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-muted-foreground text-xs">{[i.brand, i.model].filter(Boolean).join(' · ') || '—'}</div>
                </div>
            ),
        },
        { key: 'category', header: t('stock_category'), render: (i) => <span className="text-sm">{i.category ?? '—'}</span> },
        { key: 'bar', header: `${t('stock_stock')} (Min / Max)`, className: 'min-w-[180px]', render: (i) => <StockBar item={i} /> },
        {
            key: 'current',
            header: t('stock_current'),
            align: 'right',
            render: (i) => <span className="font-mono text-sm font-bold">{i.current_stock.toLocaleString()}</span>,
        },
        {
            key: 'value',
            header: t('stock_value'),
            align: 'right',
            render: (i) => <span className="font-mono text-xs">{format(i.total_value)}</span>,
        },
        { key: 'status', header: t('status'), render: (i) => statusBadge(i.status) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (i) => {
                // An item is removable only when it holds no stock and carries no value.
                const deletable = i.current_stock === 0 && i.total_value === 0;
                return (
                    <div className="flex justify-end gap-1">
                        {canManage && (
                            <button
                                // Stop the click from bubbling to the row (which opens the detail view).
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditItem(i);
                                }}
                                title={t('stock_edit_item')}
                                className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md"
                            >
                                <SquarePen className="h-4 w-4" />
                            </button>
                        )}
                        {can('delete') && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (deletable) confirmDelete(i);
                                }}
                                disabled={!deletable}
                                title={deletable ? t('stock_delete_item') : t('stock_delete_blocked')}
                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md disabled:pointer-events-none disabled:opacity-30"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                );
            },
        },
    ];

    const kpis = [
        { label: t('stock_kpi_skus'), value: summary?.skus ?? '—', sub: `${summary?.total_units ?? 0} ${t('stock_units_total')}`, icon: Archive },
        {
            label: t('stock_kpi_low'),
            value: summary ? summary.out_count + summary.low_count + summary.over_count : '—',
            sub: t('stock_needs_reorder'),
            icon: AlertTriangle,
        },
        { label: t('stock_kpi_over'), value: pendingRequests, sub: t('stock_overstock'), icon: Send },
        { label: t('stock_kpi_value'), value: summary ? formatCompact(summary.total_value) : '—', sub: t('stock_at_cost'), icon: Boxes },
    ];

    const hasAlerts = !!summary && (summary.out_count > 0 || summary.low_count > 0 || summary.over_count > 0 || summary.dead_count > 0);
    // Items-tab badge: total stock alerts (out of stock + below min + overstock).
    const itemAlerts = summary ? summary.out_count + summary.low_count + summary.over_count : 0;

    const allTabs = [
        { id: 'overview' as const, label: t('sub_overview'), view: 'view_dashboard' },
        { id: 'items' as const, label: t('stock_items_tab'), count: itemAlerts || undefined, view: 'view' },
        { id: 'requests' as const, label: t('stock_requests_tab'), count: outstandingRequests || undefined, view: 'view_request' },
        { id: 'audit' as const, label: t('stock_audit_tab'), count: draftCounts || undefined, view: 'view_count' },
        { id: 'movements' as const, label: t('stock_movements_tab'), view: 'view_events' },
    ];
    const tabs = allTabs.filter((tb) => can(tb.view));

    // If the currently active tab is filtered out (user lost permission), fall back to the first available tab.
    useEffect(() => {
        if (tabs.length > 0 && !tabs.some((tb) => tb.id === tab)) {
            changeTab(tabs[0].id);
        }
    }, [tabs, tab, changeTab]);

    // Active item filters surfaced as removable chips (search stays in its own box).
    const statusChipLabel = statusFilter === 'alerts' ? t('stock_st_alerts') : t(`stock_st_${statusFilter}` as Parameters<typeof t>[0]);
    const activeChips = [
        cat !== 'all' ? { key: 'cat', label: cat, clear: () => setCat('all') } : null,
        wh !== 'all' ? { key: 'wh', label: wh, clear: () => setWh('all') } : null,
        statusFilter !== 'all' ? { key: 'status', label: statusChipLabel, clear: () => setStatusFilter('all') } : null,
    ].filter((c): c is { key: string; label: string; clear: () => void } => c !== null);
    // Anything to clear = an active chip filter OR a non-default sort order (drives the popover badge).
    const activeItemFilterCount = activeChips.length + (itemSort !== DEFAULT_ITEM_SORT ? 1 : 0);
    const resetItemFilters = () => {
        setCat('all');
        setWh('all');
        setStatusFilter('all');
        setItemSort(DEFAULT_ITEM_SORT);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">{t('stock_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('stock_subtitle')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {can('request') && (
                        <Button onClick={() => setReqOpen(true)}>
                            <FilePlus2 className="h-4 w-4" />
                            {t('stock_request')}
                        </Button>
                    )}
                </div>
            </div>

            {hasAlerts && summary && (
                <AlertCard
                    summary={summary}
                    t={t}
                    onViewItems={() => {
                        changeTab('items');
                        setStatusFilter('alerts');
                    }}
                />
            )}

            <Card className="overflow-hidden">
                {/* Outstanding work and stock alerts: red pills. */}
                <PageTabs tabs={tabs.map((tb) => ({ ...tb, tone: 'alert' as const }))} active={tab} onChange={changeTab} />

                <div className="p-5">
                    {tab === 'overview' && (
                        <OverviewTab
                            summary={summary}
                            t={t}
                            kpis={kpis}
                            canEvents={can('view_events')}
                            onSelectWarehouse={(w) => {
                                // Jump to the Items tab showing only the chosen warehouse.
                                setSearch('');
                                setCat('all');
                                setStatusFilter('all');
                                setWh(w);
                                changeTab('items');
                            }}
                            onSelectCategory={(c) => {
                                // Jump to the Items tab showing only the chosen category.
                                setSearch('');
                                setWh('all');
                                setStatusFilter('all');
                                setCat(c);
                                changeTab('items');
                            }}
                        />
                    )}

                    {tab === 'items' && (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative w-full max-w-xs">
                                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                    <Input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder={t('stock_search')}
                                        className="pl-9"
                                    />
                                </div>
                                <FilterPopover count={activeItemFilterCount} width={460} onClear={resetItemFilters} resultCount={itemsTotal}>
                                    {() => (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                    <Tag className="h-3.5 w-3.5" />
                                                    {t('stock_category')}
                                                </div>
                                                <SearchableSelect
                                                    active={cat !== 'all'}
                                                    value={cat}
                                                    onChange={setCat}
                                                    options={[
                                                        {
                                                            value: 'all',
                                                            label: t('stock_all_categories'),
                                                            search: t('stock_all_categories'),
                                                            icon: <ToneDot tone="gray" />,
                                                        },
                                                        ...categories.map((c) => ({ value: c.name, label: c.name, search: c.name })),
                                                    ]}
                                                />
                                            </div>
                                            <div>
                                                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                    <Warehouse className="h-3.5 w-3.5" />
                                                    {t('stock_warehouse')}
                                                </div>
                                                <SearchableSelect
                                                    active={wh !== 'all'}
                                                    value={wh}
                                                    onChange={setWh}
                                                    options={[
                                                        {
                                                            value: 'all',
                                                            label: t('stock_all_warehouses'),
                                                            search: t('stock_all_warehouses'),
                                                            icon: <ToneDot tone="gray" />,
                                                        },
                                                        ...warehouses.map((w) => ({
                                                            value: w.name,
                                                            label: w.name,
                                                            search: w.name,
                                                            icon: <Warehouse className="text-muted-foreground/70 h-4 w-4" />,
                                                        })),
                                                    ]}
                                                />
                                            </div>
                                            <div>
                                                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                    <CircleDot className="h-3.5 w-3.5" />
                                                    {t('status')}
                                                </div>
                                                <SearchableSelect
                                                    active={statusFilter !== 'all'}
                                                    value={statusFilter}
                                                    onChange={setStatusFilter}
                                                    options={[
                                                        {
                                                            value: 'all',
                                                            label: t('stock_all_statuses'),
                                                            search: t('stock_all_statuses'),
                                                            icon: <ToneDot tone="gray" />,
                                                        },
                                                        {
                                                            value: 'alerts',
                                                            label: t('stock_st_alerts'),
                                                            search: t('stock_st_alerts'),
                                                            icon: <ToneDot tone="red" />,
                                                        },
                                                        ...(['ok', 'low', 'out', 'over', 'dead'] as StockItemStatus[]).map((s) => ({
                                                            value: s,
                                                            label: t(`stock_st_${s}` as Parameters<typeof t>[0]),
                                                            search: t(`stock_st_${s}` as Parameters<typeof t>[0]),
                                                            icon: <ToneDot tone={STATUS_TONE[s]} />,
                                                        })),
                                                    ]}
                                                />
                                            </div>
                                            <div>
                                                <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                                    <ArrowUpDown className="h-3.5 w-3.5" />
                                                    {t('stock_sort_by')}
                                                </div>
                                                <SearchableSelect
                                                    active={itemSort !== DEFAULT_ITEM_SORT}
                                                    value={itemSort}
                                                    onChange={setItemSort}
                                                    options={[
                                                        { value: 'name_asc', label: t('stock_sort_name_asc'), search: t('stock_sort_name_asc') },
                                                        { value: 'name_desc', label: t('stock_sort_name_desc'), search: t('stock_sort_name_desc') },
                                                        {
                                                            value: 'stock_desc',
                                                            label: t('stock_sort_stock_desc'),
                                                            search: t('stock_sort_stock_desc'),
                                                        },
                                                        { value: 'stock_asc', label: t('stock_sort_stock_asc'), search: t('stock_sort_stock_asc') },
                                                        {
                                                            value: 'value_desc',
                                                            label: t('stock_sort_value_desc'),
                                                            search: t('stock_sort_value_desc'),
                                                        },
                                                        { value: 'value_asc', label: t('stock_sort_value_asc'), search: t('stock_sort_value_asc') },
                                                    ]}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </FilterPopover>
                                {activeItemFilterCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={resetItemFilters}
                                        className="border-border text-muted-foreground hover:bg-accent hover:text-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                                    >
                                        <X className="h-3 w-3" />
                                        {t('reset_filters')}
                                    </button>
                                )}
                                <div className="ml-auto flex flex-wrap items-center gap-2">
                                    {can('receive') && (
                                        <Button variant="outline" onClick={() => setMoveKind('receive')}>
                                            <ArrowDownToLine className="h-4 w-4" />
                                            {t('stock_mv_receive')}
                                        </Button>
                                    )}
                                    {can('return') && (
                                        <Button variant="outline" onClick={() => setMoveKind('return')}>
                                            <RotateCcw className="h-4 w-4" />
                                            {t('stock_mv_return')}
                                        </Button>
                                    )}
                                    {can('transfer') && (
                                        <Button variant="outline" onClick={() => setMoveKind('transfer')}>
                                            <ArrowLeftRight className="h-4 w-4" />
                                            {t('stock_mv_transfer')}
                                        </Button>
                                    )}
                                    {canManage && (
                                        <Button onClick={openAdd}>
                                            <Plus className="h-4 w-4" />
                                            {t('stock_new_sku')}
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Active filters as removable chips. */}
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

                            <DataTable
                                columns={columns}
                                rows={items}
                                rowKey={(i) => i.id}
                                onRowClick={(i) => setViewId(i.id)}
                                loading={itemsLoading || itemsFetching}
                                server={{
                                    page: itemsPage,
                                    pageSize: itemsPerPage,
                                    total: itemsTotal,
                                    onPageChange: setItemsPage,
                                    onPageSizeChange: (s) => {
                                        setItemsPerPage(s);
                                        setItemsPage(1);
                                    },
                                }}
                            />
                        </div>
                    )}

                    {tab === 'movements' && <MovementsTab />}
                    {tab === 'requests' && (
                        <RequestsTab
                            can={can}
                            onNew={() => setReqOpen(true)}
                            page={reqPage}
                            setPage={setReqPage}
                            perPage={reqPerPage}
                            setPerPage={setReqPerPage}
                        />
                    )}

                    {tab === 'audit' && <AuditTab can={can} />}
                </div>
            </Card>

            <StockItemModal
                open={adding || !!editItem}
                item={editItem}
                onClose={() => {
                    closeAdd();
                    setEditItem(null);
                }}
            />
            <StockItemDetailModal
                // Stays open while editing; the edit modal stacks on top and closing returns here.
                itemId={viewId}
                onClose={() => setViewId(null)}
                onEdit={canManage ? (i) => setEditItem(i) : undefined}
            />
            <MovementDrawer kind={moveKind} onClose={() => setMoveKind(null)} />
            <RequestDrawer open={reqOpen} onClose={() => setReqOpen(false)} />
        </div>
    );
}
