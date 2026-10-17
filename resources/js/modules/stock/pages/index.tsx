import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { useCategories, useCurrency, useWarehouses } from '@/modules/settings';
import { Column, DataTable } from '@/shared/components/data-table';
import { DisabledReason } from '@/shared/components/disabled-reason';
import { FilterPopover } from '@/shared/components/filter-popover';
import { InfoPopover } from '@/shared/components/info-popover';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import { PageTabs } from '@/shared/components/page-tabs';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatusBadge, ToneDot } from '@/shared/components/status-badge';
import { TruncText } from '@/shared/components/trunc-text';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { type ListParamPatch, useListParams } from '@/shared/hooks/use-list-params';
import { useLocalName } from '@/shared/hooks/use-local-name';
import { useTabParam } from '@/shared/hooks/use-tab-param';
import { refusalReason } from '@/shared/lib/api-errors';
import { localPair, nameSearch } from '@/shared/lib/local-name';
import { cn, toRecordId } from '@/shared/lib/utils';
import type { StockItem, StockItemStatus } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Input } from '@/shared/ui/input';
import { useUiStore } from '@/stores/ui';
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
import { useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MovementDrawer, type MovementKind } from '../components/movement-drawer';
import { RequestDrawer } from '../components/request-drawer';
import { StockItemDetailModal } from '../components/stock-item-detail-modal';
import { StockItemModal } from '../components/stock-item-modal';
import { STOCK_STATUS_TONE, StockLevelBar } from '../components/stock-level-bar';
import { useStockCounts, useStockItemMutations, useStockItemsPage, useStockRequests, useStockSummary } from '../hooks/use-stock';
import { ALERT_BLINK } from './shared';
import { AuditTab } from './tabs/counting-tab';
import { MovementsTab } from './tabs/movements-tab';
import { OverviewTab } from './tabs/overview-tab';
import { RequestsTab } from './tabs/requests-tab';

// The page's tabs, mirrored in the URL (?tab=).
const STOCK_TABS = ['overview', 'items', 'movements', 'requests', 'audit'] as const;
type StockTab = (typeof STOCK_TABS)[number];
const isStockTab = (v: string | null): v is StockTab => STOCK_TABS.includes(v as StockTab);

// localStorage key for the reader's last-used Items-tab filters (the URL stays the source of truth).
const STOCK_FILTER_KEY = 'stock.item-filters';

// Default sort for the Items table — alphabetical by name.
const DEFAULT_ITEM_SORT = 'name_asc';
const ITEM_SORTS = ['name_asc', 'name_desc', 'stock_desc', 'stock_asc', 'value_desc', 'value_asc'];
const ITEM_STATUSES = ['alerts', 'ok', 'low', 'out', 'over', 'dead'];
// Every tab's list keys in the URL; a tab switch clears them (rows-per-page stays).
const LIST_KEYS = ['search', 'cat', 'wh', 'status', 'sort', 'type', 'page'];
const ITEM_LIST_KEYS = ['search', 'cat', 'wh', 'status', 'sort', 'page', 'per'];

type ItemFilters = { search: string; cat: string; wh: string; status: string; sort: string };

const toItemFilters = (raw: Partial<Record<keyof ItemFilters, unknown>>): ItemFilters => ({
    search: typeof raw.search === 'string' ? raw.search : '',
    cat: typeof raw.cat === 'string' && raw.cat ? raw.cat : 'all',
    wh: typeof raw.wh === 'string' && raw.wh ? raw.wh : 'all',
    status: ITEM_STATUSES.includes(raw.status as string) ? (raw.status as string) : 'all',
    sort: ITEM_SORTS.includes(raw.sort as string) ? (raw.sort as string) : DEFAULT_ITEM_SORT,
});

const readSavedItemFilters = (): ItemFilters => {
    try {
        return toItemFilters(JSON.parse(localStorage.getItem(STOCK_FILTER_KEY) || '{}'));
    } catch {
        return toItemFilters({});
    }
};

const saveItemFilters = (filters: ItemFilters) => {
    try {
        localStorage.setItem(STOCK_FILTER_KEY, JSON.stringify(filters));
    } catch {
        // Storage unavailable — the URL still holds the filters.
    }
};

// URL form of the Items filters: defaults are left out, and the page returns to 1.
const itemFilterParams = (f: ItemFilters): ListParamPatch => ({
    search: f.search || null,
    cat: f.cat === 'all' ? null : f.cat,
    wh: f.wh === 'all' ? null : f.wh,
    status: f.status === 'all' ? null : f.status,
    sort: f.sort === DEFAULT_ITEM_SORT ? null : f.sort,
    page: null,
});

const applyParams = (params: URLSearchParams, patch: ListParamPatch) => {
    for (const [key, value] of Object.entries(patch)) {
        if (value) {
            params.set(key, value);
        } else {
            params.delete(key);
        }
    }
};

/** Alert banner shown when any items are in a warning state, with a count per type. */
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
    const counts = [
        { key: 'out', count: summary.out_count, label: t('stock_alert_out'), className: 'text-destructive' },
        { key: 'low', count: summary.low_count, label: t('stock_alert_low'), className: 'text-amber-700 dark:text-amber-400' },
        { key: 'over', count: summary.over_count, label: t('stock_alert_over'), className: 'text-blue-700 dark:text-blue-400' },
        { key: 'dead', count: summary.dead_count, label: t('stock_alert_dead'), className: 'text-muted-foreground' },
    ].filter((c) => c.count > 0);
    return (
        <Card className={cn('border p-4', hasCritical ? 'border-destructive/40 bg-destructive/5' : 'border-amber-500/40 bg-amber-500/5')}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span
                        className={cn(
                            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                            hasCritical
                                ? 'bg-destructive/10 dark:text-destructive text-red-700'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                        )}
                        aria-hidden
                    >
                        <AlertTriangle className={cn(ALERT_BLINK, 'h-5 w-5')} />
                    </span>
                    <div>
                        <div className="font-semibold">{t('stock_minmax_alerts')}</div>
                        <ul className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                            {counts.map((c) => (
                                <li
                                    key={c.key}
                                    className={cn('bg-background/60 rounded-full border px-2 py-0.5 font-medium tabular-nums', c.className)}
                                >
                                    {c.count} {c.label}
                                </li>
                            ))}
                        </ul>
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
    const nameOf = useLocalName();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const filterIds = { cat: useId(), wh: useId(), status: useId(), sort: useId() };
    // Every gate on this page lives under the stock.* prefix.
    const { can: hasPermission } = useAuth();
    const can = (p: string) => hasPermission(`stock.${p}`);
    const canManage = can('manage_items');

    const [searchParams, setSearchParams] = useSearchParams();
    // The tab lives in ?tab= (useTabParam): reloads / shared links are exact, Back steps through tabs.
    const [tab, setTab] = useTabParam(isStockTab, 'overview');

    // Items search, filters, sort and page live in the URL (?search, cat, wh, status, sort, page, per).
    const list = useListParams();
    const itemFilters = toItemFilters({
        search: list.get('search'),
        cat: list.get('cat'),
        wh: list.get('wh'),
        status: list.get('status'),
        sort: list.get('sort'),
    });
    const { search, cat, wh, status: statusFilter, sort: itemSort } = itemFilters;
    const sentSearch = useDebouncedSearch(search);
    // A filter the reader picks is also remembered for their next visit; a shared link's filters are not.
    const setItemFilters = (patch: Partial<ItemFilters>) => {
        const next = { ...itemFilters, ...patch };
        saveItemFilters(next);
        list.setParams(itemFilterParams(next));
    };
    // Typing only writes ?search; the page returns to 1 when the debounced search is sent.
    const setSearch = (value: string) => {
        const next = { ...itemFilters, search: value };
        saveItemFilters(next);
        list.setParams({ search: value || null });
    };
    const pageSearch = useRef(sentSearch);
    const searchChanged = sentSearch !== pageSearch.current;
    useEffect(() => {
        if (!searchChanged) return;
        if (list.page > 1) {
            list.setParams({ page: null });
            return;
        }
        pageSearch.current = sentSearch;
    }, [searchChanged, sentSearch, list.page]); // eslint-disable-line react-hooks/exhaustive-deps
    const setCat = (value: string) => setItemFilters({ cat: value });
    const setWh = (value: string) => setItemFilters({ wh: value });
    const setStatusFilter = (value: string) => setItemFilters({ status: value });
    const setItemSort = (value: string) => setItemFilters({ sort: value });

    // Open the Items tab in one URL write: coming from another tab starts from the remembered filters.
    const openItems = (patch: Partial<ItemFilters> = {}) => {
        const next = { ...(tab === 'items' ? itemFilters : readSavedItemFilters()), ...patch };
        if (Object.keys(patch).length > 0) saveItemFilters(next);
        setTab('items', {
            replace: tab === 'items',
            extra: (p) => {
                LIST_KEYS.forEach((key) => p.delete(key));
                applyParams(p, itemFilterParams(next));
            },
        });
    };
    const changeTab = (next: StockTab) => {
        if (next === tab) return;
        if (next === 'items') {
            openItems();
            return;
        }
        setTab(next, { extra: (p) => LIST_KEYS.forEach((key) => p.delete(key)) });
    };

    // First time the Items tab shows with no list keys in the URL, bring back the remembered filters.
    const restoreChecked = useRef(false);
    useEffect(() => {
        if (restoreChecked.current || tab !== 'items') return;
        restoreChecked.current = true;
        if (ITEM_LIST_KEYS.some((key) => searchParams.has(key))) return;
        const saved = itemFilterParams(readSavedItemFilters());
        if (Object.values(saved).some(Boolean)) list.setParams(saved);
    }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
    const [editItem, setEditItem] = useState<StockItem | null>(null);
    // Item detail is URL-driven (?view=<id>); only a real record id opens it.
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
    const [moveKind, setMoveKind] = useState<MovementKind | null>(null);
    const [reqOpen, setReqOpen] = useState(false);

    const { data: summary, isError: summaryFailed, refetch: refetchSummary } = useStockSummary();
    const { data: categories = [] } = useCategories();
    const { data: warehouses = [] } = useWarehouses();
    // Server-side pagination for the Items table.
    const { page: itemsPage, perPage: itemsPerPage } = list;

    const {
        data: itemsPageData,
        isLoading: itemsLoading,
        isFetching: itemsFetching,
    } = useStockItemsPage({
        search: sentSearch || undefined,
        category: cat === 'all' ? undefined : cat,
        warehouse: wh === 'all' ? undefined : wh,
        status: statusFilter === 'all' ? undefined : statusFilter,
        sort: itemSort,
        page: searchChanged ? 1 : itemsPage,
        per_page: itemsPerPage,
    });
    const items = itemsPageData?.data ?? [];
    const itemsTotal = itemsPageData?.meta.total ?? 0;

    const canViewRequests = can('view_request');
    const { data: requestsPage } = useStockRequests({}, canViewRequests);
    const pendingRequests = requestsPage?.meta.pending ?? 0;
    // Outstanding work = awaiting approval (pending) + awaiting fulfillment (approved).
    const outstandingRequests = requestsPage?.meta.outstanding ?? 0;

    // Outstanding counting work = draft (not-yet-committed) count sessions.
    const { data: countsPage } = useStockCounts({}, can('view_count'));
    const draftCounts = countsPage?.meta.draft ?? 0;

    const { remove } = useStockItemMutations();

    // Delete an empty SKU after a confirm; a server refusal is shown inside the dialog.
    const confirmDelete = async (i: StockItem) => {
        await confirm({
            variant: 'danger',
            title: t('stock_delete_item'),
            description: t('stock_delete_confirm'),
            entity: { name: i.name, sub: i.sku },
            action: () => remove.mutateAsync(i.id),
            errorMessage: (e) => {
                const refusal = refusalReason(e);
                // Stock arrived after the list was drawn, so the button was still enabled.
                if (refusal?.reason === 'item_has_stock') return t('stock_refusal_item_has_stock');
                if (refusal?.reason !== 'has_history') return undefined;
                return t('stock_delete_has_history').replace('{count}', String(refusal.body.movements_count ?? 0));
            },
        });
    };

    const { format, formatCompact } = useCurrency();
    const fmt = useDateFormat();

    const statusBadge = (s: StockItemStatus) => (
        <StatusBadge tone={STOCK_STATUS_TONE[s]}>{t(`stock_st_${s}` as Parameters<typeof t>[0])}</StatusBadge>
    );

    const columns: Column<StockItem>[] = [
        {
            key: 'sku',
            sticky: 'left',
            header: t('stock_sku'),
            width: '110px',
            className: 'whitespace-nowrap',
            render: (i) => <span className="text-xs">{i.sku}</span>,
        },
        {
            key: 'name',
            header: t('stock_item'),
            minWidth: '14rem',
            render: (i) => (
                <div className="min-w-0">
                    <TruncText text={i.name} className="text-sm font-medium" />
                    <TruncText text={[i.brand, i.model].filter(Boolean).join(' ')} className="text-muted-foreground text-xs" />
                </div>
            ),
        },
        {
            key: 'category',
            header: t('stock_category'),
            width: '180px',
            render: (i) => <span className="text-sm">{localPair(i.category, i.category_th, lang) ?? '—'}</span>,
        },
        {
            key: 'bar',
            header: `${t('stock_stock')} (Min / Max)`,
            width: '170px',
            render: (i) => <StockLevelBar current={i.current_stock} min={i.min_stock} max={i.max_stock} status={i.status} />,
        },
        {
            key: 'current',
            header: t('stock_current'),
            align: 'right',
            width: '120px',
            className: 'whitespace-nowrap',
            render: (i) => (
                <div>
                    <span className="text-sm font-bold tabular-nums">{i.current_stock.toLocaleString()}</span>
                    {!!i.reserved && (
                        <InfoPopover
                            label={t('stock_reserved_n').replace('{n}', String(i.reserved))}
                            content={t('stock_reserved_note').replace('{n}', String(Math.max(0, i.current_stock - i.reserved)))}
                            className="text-muted-foreground block w-full text-right text-xs whitespace-nowrap"
                            isolate
                        >
                            {t('stock_reserved_n').replace('{n}', String(i.reserved))}
                        </InfoPopover>
                    )}
                </div>
            ),
        },
        {
            key: 'unit',
            header: t('stock_unit'),
            width: '64px',
            render: (i) => <TruncText text={i.unit} className="text-muted-foreground text-xs lowercase" />,
        },
        {
            key: 'cost',
            header: t('stock_unit_cost_short'),
            align: 'right',
            width: '110px',
            className: 'whitespace-nowrap',
            render: (i) => <span className="text-xs tabular-nums">{format(i.cost)}</span>,
        },
        {
            key: 'value',
            header: t('stock_value'),
            align: 'right',
            width: '120px',
            className: 'whitespace-nowrap',
            render: (i) => <span className="text-xs tabular-nums">{format(i.total_value)}</span>,
        },
        { key: 'status', header: t('status'), width: '110px', className: 'whitespace-nowrap', render: (i) => statusBadge(i.status) },
        {
            key: 'last_move',
            header: t('stock_last_move'),
            width: '130px',
            className: 'whitespace-nowrap',
            render: (i) => <span className="text-muted-foreground text-xs">{i.last_move_at ? fmt.date(i.last_move_at) : '—'}</span>,
        },
        {
            key: 'warranty',
            header: t('stock_warranty'),
            width: '110px',
            render: (i) => <TruncText text={i.warranty} className="text-xs" />,
        },
        {
            key: 'actions',
            header: <span className="sr-only">{t('actions')}</span>,
            align: 'right',
            width: '80px',
            render: (i) => {
                // Removable only when it holds no stock and carries no value.
                const deletable = i.current_stock === 0 && i.total_value === 0;
                return (
                    <div className="flex justify-end gap-1">
                        {canManage && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditItem(i);
                                }}
                                title={t('stock_edit_item')}
                                aria-label={t('stock_edit_item')}
                                className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md"
                            >
                                <SquarePen className="h-4 w-4" aria-hidden />
                            </button>
                        )}
                        {can('delete') && (
                            <DisabledReason reason={deletable ? null : t('stock_delete_blocked')} label={t('stock_delete_item')}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (deletable) confirmDelete(i);
                                    }}
                                    disabled={!deletable}
                                    title={deletable ? t('stock_delete_item') : undefined}
                                    aria-label={t('stock_delete_item')}
                                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-50"
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                </button>
                            </DisabledReason>
                        )}
                    </div>
                );
            },
        },
    ];

    const viewAlerts = () => openItems({ status: 'alerts' });
    const kpis = [
        { label: t('stock_kpi_skus'), value: summary?.skus ?? '—', sub: `${summary?.total_units ?? 0} ${t('stock_units_total')}`, icon: Archive },
        {
            label: t('stock_kpi_alerts_sub'),
            value: summary ? summary.out_count + summary.low_count + summary.over_count + summary.dead_count : '—',
            sub: t('stock_kpi_low'),
            icon: AlertTriangle,
            onClick: viewAlerts,
        },
        {
            label: t('stock_kpi_requests'),
            value: canViewRequests ? pendingRequests : '—',
            sub: canViewRequests ? t('stock_kpi_requests_pending') : t('stock_kpi_requests_no_right'),
            icon: Send,
            onClick: canViewRequests ? () => changeTab('requests') : undefined,
        },
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

    // A tab the reader may not open falls back to the first available one (replace, so Back stays clean).
    useEffect(() => {
        if (tabs.length > 0 && !tabs.some((tb) => tb.id === tab)) {
            setTab(tabs[0].id, { replace: true });
        }
    }, [tabs, tab]); // eslint-disable-line react-hooks/exhaustive-deps

    // Active item filters surfaced as removable chips (search stays in its own box).
    const statusChipLabel = statusFilter === 'alerts' ? t('stock_st_alerts') : t(`stock_st_${statusFilter}` as Parameters<typeof t>[0]);
    const activeChips = [
        cat !== 'all' ? { key: 'cat', label: cat, clear: () => setCat('all') } : null,
        wh !== 'all' ? { key: 'wh', label: wh, clear: () => setWh('all') } : null,
        statusFilter !== 'all' ? { key: 'status', label: statusChipLabel, clear: () => setStatusFilter('all') } : null,
    ].filter((c): c is { key: string; label: string; clear: () => void } => c !== null);
    // Anything to clear = an active chip filter OR a non-default sort order (drives the popover badge).
    const activeItemFilterCount = activeChips.length + (itemSort !== DEFAULT_ITEM_SORT ? 1 : 0);
    const resetItemFilters = () => setItemFilters({ cat: 'all', wh: 'all', status: 'all', sort: DEFAULT_ITEM_SORT });

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
                            <FilePlus2 className="h-4 w-4" aria-hidden />
                            {t('stock_request')}
                        </Button>
                    )}
                </div>
            </div>

            {hasAlerts && summary && <AlertCard summary={summary} t={t} onViewItems={viewAlerts} />}

            <Card className="overflow-clip">
                {/* Outstanding work and stock alerts: red pills. */}
                <PageTabs tabs={tabs.map((tb) => ({ ...tb, tone: 'alert' as const }))} active={tab} onChange={changeTab} />

                <div className="p-5">
                    {tab === 'overview' && !summary && summaryFailed && <LoadFailedPanel onRetry={() => refetchSummary()} />}
                    {tab === 'overview' && (summary || !summaryFailed) && (
                        <OverviewTab
                            summary={summary}
                            t={t}
                            kpis={kpis}
                            canEvents={can('view_events')}
                            // Jump to the Items tab showing only the chosen warehouse / category.
                            onSelectWarehouse={(w) => openItems({ search: '', cat: 'all', status: 'all', wh: w })}
                            onSelectCategory={(c) => openItems({ search: '', wh: 'all', status: 'all', cat: c })}
                            onViewAlerts={viewAlerts}
                        />
                    )}

                    {tab === 'items' && (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative w-full max-w-xs">
                                    <Search
                                        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                                        aria-hidden
                                    />
                                    <Input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder={t('stock_search')}
                                        aria-label={t('stock_search')}
                                        name="search"
                                        autoComplete="off"
                                        className="pl-9"
                                    />
                                </div>
                                <FilterPopover count={activeItemFilterCount} width={460} onClear={resetItemFilters} resultCount={itemsTotal}>
                                    {() => (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label
                                                    htmlFor={filterIds.cat}
                                                    className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium"
                                                >
                                                    <Tag className="h-3.5 w-3.5" aria-hidden />
                                                    {t('stock_category')}
                                                </label>
                                                <SearchableSelect
                                                    id={filterIds.cat}
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
                                                        ...categories.map((c) => ({ value: c.name, label: nameOf(c), search: nameSearch(c) })),
                                                    ]}
                                                />
                                            </div>
                                            <div>
                                                <label
                                                    htmlFor={filterIds.wh}
                                                    className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium"
                                                >
                                                    <Warehouse className="h-3.5 w-3.5" aria-hidden />
                                                    {t('stock_warehouse')}
                                                </label>
                                                <SearchableSelect
                                                    id={filterIds.wh}
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
                                                <label
                                                    htmlFor={filterIds.status}
                                                    className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium"
                                                >
                                                    <CircleDot className="h-3.5 w-3.5" aria-hidden />
                                                    {t('status')}
                                                </label>
                                                <SearchableSelect
                                                    id={filterIds.status}
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
                                                            icon: <ToneDot tone={STOCK_STATUS_TONE[s]} />,
                                                        })),
                                                    ]}
                                                />
                                            </div>
                                            <div>
                                                <label
                                                    htmlFor={filterIds.sort}
                                                    className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium"
                                                >
                                                    <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
                                                    {t('stock_sort_by')}
                                                </label>
                                                <SearchableSelect
                                                    id={filterIds.sort}
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
                                        <X className="h-3 w-3" aria-hidden />
                                        {t('reset_filters')}
                                    </button>
                                )}
                                <div className="ml-auto flex flex-wrap items-center gap-2">
                                    {can('receive') && (
                                        <Button variant="outline" onClick={() => setMoveKind('receive')}>
                                            <ArrowDownToLine className="h-4 w-4" aria-hidden />
                                            {t('stock_mv_receive')}
                                        </Button>
                                    )}
                                    {can('return') && (
                                        <Button variant="outline" onClick={() => setMoveKind('return')}>
                                            <RotateCcw className="h-4 w-4" aria-hidden />
                                            {t('stock_mv_return')}
                                        </Button>
                                    )}
                                    {can('transfer') && (
                                        <Button variant="outline" onClick={() => setMoveKind('transfer')}>
                                            <ArrowLeftRight className="h-4 w-4" aria-hidden />
                                            {t('stock_mv_transfer')}
                                        </Button>
                                    )}
                                    {canManage && (
                                        <Button onClick={openAdd}>
                                            <Plus className="h-4 w-4" aria-hidden />
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
                                            aria-label={`${t('remove_filter')}: ${c.label}`}
                                            className="bg-brand/10 text-brand hover:bg-brand/20 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                                        >
                                            {c.label}
                                            <X className="h-3 w-3" aria-hidden />
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
                                caption={t('stock_items_tab')}
                                server={{ ...list.table.paging, total: itemsTotal }}
                            />
                        </div>
                    )}

                    {tab === 'movements' && <MovementsTab />}
                    {tab === 'requests' && <RequestsTab can={can} onNew={() => setReqOpen(true)} />}

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
