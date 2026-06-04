import { Column, DataTable } from '@/components/shared/data-table';
import { FilterPopover } from '@/components/shared/filter-popover';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { StatusBadge } from '@/components/shared/status-badge';
import { MovementDrawer } from '@/components/stock/movement-drawer';
import { RequestDrawer } from '@/components/stock/request-drawer';
import { StockItemDetailModal } from '@/components/stock/stock-item-detail-modal';
import { StockItemModal } from '@/components/stock/stock-item-modal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { useCategories, useWarehouses } from '@/hooks/use-master-data';
import { useCurrency, useDateTime } from '@/hooks/use-settings';
import {
    useMovementSerials,
    useStockCount,
    useStockCountMutations,
    useStockCounts,
    useStockItem,
    useStockItemMutations,
    useStockItems,
    useStockMovements,
    useStockRequestActions,
    useStockRequests,
    useStockSummary,
} from '@/hooks/use-stock';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Role, StockCountAdjustMode, StockItem, StockItemStatus, StockMovementType, StockRequest, StockRequestStatus } from '@/types';
import {
    AlertTriangle,
    Archive,
    ArrowDownToLine,
    ArrowLeftRight,
    ArrowRight,
    ArrowUpFromLine,
    Boxes,
    Check,
    ClipboardList,
    FilePlus2,
    FileText,
    Layers,
    Loader2,
    Plus,
    Printer,
    RotateCcw,
    Search,
    Send,
    SquarePen,
    Trash2,
    Warehouse,
    X,
    Zap,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

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

/** Alert banner shown when any items are in a warning state. Displays real item data grouped by type. */
function AlertCard({ summary, t, onViewItems }: { summary: import('@/types').StockSummary; t: ReturnType<typeof useT>; onViewItems: () => void }) {
    const hasCritical = summary.out_count > 0 || summary.low_count > 0;
    return (
        <Card className={cn('border p-4', hasCritical ? 'border-destructive/40 bg-destructive/5' : 'border-amber-500/40 bg-amber-500/5')}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span
                        className={cn(
                            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                            hasCritical ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600',
                        )}
                    >
                        <AlertTriangle className="h-5 w-5" />
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
    const { user } = useAuth();
    const role = (user?.role ?? 'user') as Role;
    const perms = user?.permissions ?? [];
    const can = (p: string) => role === 'super' || perms.includes(`stock.${p}`);
    const canManage = can('manage_items');

    const [tab, setTab] = useState<'dashboard' | 'items' | 'movements' | 'requests' | 'audit'>('dashboard');
    const [search, setSearch] = useState('');
    const [cat, setCat] = useState('all');
    const [wh, setWh] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [editItem, setEditItem] = useState<StockItem | null>(null);
    const [viewId, setViewId] = useState<number | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [moveKind, setMoveKind] = useState<StockMovementType | null>(null);
    const [reqOpen, setReqOpen] = useState(false);

    const { data: summary } = useStockSummary();
    const { data: categories = [] } = useCategories();
    const { data: warehouses = [] } = useWarehouses();
    const { data: items = [], isLoading: itemsLoading } = useStockItems({
        search,
        category: cat === 'all' ? undefined : cat,
        warehouse: wh === 'all' ? undefined : wh,
        status: statusFilter === 'all' ? undefined : statusFilter,
    });

    const { data: requests = [] } = useStockRequests();
    const pendingRequests = requests.filter((r) => r.status === 'pending').length;

    const { remove } = useStockItemMutations();

    // Delete an empty SKU after a confirm. Only items with 0 on-hand and 0 value
    // are deletable (the button is disabled otherwise); the server enforces this too.
    const confirmDelete = async (i: StockItem) => {
        const res = await Swal.fire({
            title: t('stock_delete_item'),
            html: `<div class="font-mono text-sm">${i.sku}</div><div class="text-sm">${i.name}</div><div class="mt-2 text-xs text-muted-foreground">${t('stock_delete_confirm')}</div>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: t('delete'),
            cancelButtonText: t('cancel'),
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            customClass: { popup: '!rounded-xl !shadow-xl', confirmButton: '!rounded-lg !font-medium', cancelButton: '!rounded-lg !font-medium' },
            reverseButtons: true,
        });
        if (res.isConfirmed) {
            remove.mutate(i.id, {
                onError: (e) => {
                    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                    Swal.fire({
            icon: 'error',
            title: 'Error',
            text: msg ?? 'Something went wrong.',
            // Re-enable pointer events blocked by a parent Radix dialog/drawer (so OK is clickable).
            didOpen: () => {
                const container = Swal.getContainer();
                if (container) {
                    container.style.pointerEvents = 'auto';
                }
            },
        });
                },
            });
        }
    };

    const { symbol } = useCurrency();
    const fmtK = (n: number) => `${symbol}${(n / 1000).toFixed(0)}K`;

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
            render: (i) => (
                <span className="font-mono text-xs">
                    {symbol}
                    {i.total_value.toLocaleString()}
                </span>
            ),
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
        { label: t('stock_kpi_value'), value: summary ? fmtK(summary.total_value) : '—', sub: t('stock_at_cost'), icon: Boxes },
    ];

    const hasAlerts = !!summary && (summary.out_count > 0 || summary.low_count > 0 || summary.over_count > 0 || summary.dead_count > 0);

    const tabs = [
        { id: 'dashboard' as const, label: t('sub_dashboard') },
        { id: 'items' as const, label: t('stock_items_tab'), count: summary?.skus },
        { id: 'requests' as const, label: t('stock_requests_tab') },
        { id: 'audit' as const, label: t('stock_audit_tab') },
        { id: 'movements' as const, label: t('stock_movements_tab') },
    ];

    // Active item filters surfaced as removable chips (search stays in its own box).
    const statusChipLabel = statusFilter === 'alerts' ? t('stock_st_alerts') : t(`stock_st_${statusFilter}` as Parameters<typeof t>[0]);
    const activeChips = [
        cat !== 'all' ? { key: 'cat', label: cat, clear: () => setCat('all') } : null,
        wh !== 'all' ? { key: 'wh', label: wh, clear: () => setWh('all') } : null,
        statusFilter !== 'all' ? { key: 'status', label: statusChipLabel, clear: () => setStatusFilter('all') } : null,
    ].filter((c): c is { key: string; label: string; clear: () => void } => c !== null);
    const resetItemFilters = () => {
        setCat('all');
        setWh('all');
        setStatusFilter('all');
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
                        <Button variant="outline" onClick={() => setReqOpen(true)}>
                            <Send className="h-4 w-4" />
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
                        setTab('items');
                        setStatusFilter('alerts');
                    }}
                />
            )}

            <Card className="overflow-hidden">
                <div className="border-border flex flex-wrap gap-1 border-b px-3 pt-1">
                    {tabs.map((tb) => (
                        <button
                            key={tb.id}
                            onClick={() => setTab(tb.id)}
                            className={cn(
                                '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                                tab === tb.id ? 'border-brand text-foreground' : 'text-muted-foreground hover:text-foreground border-transparent',
                            )}
                        >
                            {tb.label}
                            {tb.count != null && <span className="ml-1.5 font-mono text-xs opacity-60">{tb.count}</span>}
                        </button>
                    ))}
                </div>

                <div className="p-5">
                    {tab === 'dashboard' && (
                        <DashboardTab
                            summary={summary}
                            t={t}
                            kpis={kpis}
                            onSelectWarehouse={(w) => {
                                // Jump to the Items tab showing only the chosen warehouse.
                                setSearch('');
                                setCat('all');
                                setStatusFilter('all');
                                setWh(w);
                                setTab('items');
                            }}
                            onSelectCategory={(c) => {
                                // Jump to the Items tab showing only the chosen category.
                                setSearch('');
                                setWh('all');
                                setStatusFilter('all');
                                setCat(c);
                                setTab('items');
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
                                <FilterPopover count={activeChips.length}>
                                    {() => (
                                        <div className="space-y-3">
                                            <div>
                                                <div className="text-muted-foreground mb-1 text-xs font-medium">{t('stock_category')}</div>
                                                <SearchableSelect
                                                    value={cat}
                                                    onChange={setCat}
                                                    options={[
                                                        { value: 'all', label: t('stock_all_categories'), search: t('stock_all_categories') },
                                                        ...categories.map((c) => ({ value: c.name, label: c.name, search: c.name })),
                                                    ]}
                                                />
                                            </div>
                                            <div>
                                                <div className="text-muted-foreground mb-1 text-xs font-medium">{t('stock_warehouse')}</div>
                                                <SearchableSelect
                                                    value={wh}
                                                    onChange={setWh}
                                                    options={[
                                                        { value: 'all', label: t('stock_all_warehouses'), search: t('stock_all_warehouses') },
                                                        ...warehouses.map((w) => ({ value: w.name, label: w.name, search: w.name })),
                                                    ]}
                                                />
                                            </div>
                                            <div>
                                                <div className="text-muted-foreground mb-1 text-xs font-medium">{t('status')}</div>
                                                <SearchableSelect
                                                    value={statusFilter}
                                                    onChange={setStatusFilter}
                                                    options={[
                                                        { value: 'all', label: t('stock_all_statuses'), search: t('stock_all_statuses') },
                                                        { value: 'alerts', label: t('stock_st_alerts'), search: t('stock_st_alerts') },
                                                        ...(['ok', 'low', 'out', 'over', 'dead'] as StockItemStatus[]).map((s) => ({
                                                            value: s,
                                                            label: t(`stock_st_${s}` as Parameters<typeof t>[0]),
                                                            search: t(`stock_st_${s}` as Parameters<typeof t>[0]),
                                                        })),
                                                    ]}
                                                />
                                            </div>
                                            {activeChips.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={resetItemFilters}
                                                    className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium"
                                                >
                                                    <X className="h-3 w-3" />
                                                    {t('reset_filters')}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </FilterPopover>
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
                                        <Button onClick={() => setAddOpen(true)}>
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
                                    {activeChips.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={resetItemFilters}
                                            className="text-muted-foreground hover:text-foreground px-1 text-xs font-medium"
                                        >
                                            {t('reset_filters')}
                                        </button>
                                    )}
                                </div>
                            )}

                            <DataTable
                                columns={columns}
                                rows={items}
                                rowKey={(i) => i.id}
                                onRowClick={(i) => setViewId(i.id)}
                                loading={itemsLoading}
                            />
                        </div>
                    )}

                    {tab === 'movements' && <MovementsTab />}
                    {tab === 'requests' && <RequestsTab can={can} onNew={() => setReqOpen(true)} />}

                    {tab === 'audit' && <AuditTab can={can} />}
                </div>
            </Card>

            <StockItemModal
                open={addOpen || !!editItem}
                item={editItem}
                onClose={() => {
                    setAddOpen(false);
                    setEditItem(null);
                }}
            />
            <StockItemDetailModal itemId={viewId} onClose={() => setViewId(null)} />
            <MovementDrawer kind={moveKind} onClose={() => setMoveKind(null)} />
            <RequestDrawer open={reqOpen} onClose={() => setReqOpen(false)} />
        </div>
    );
}

const MV_META: Record<StockMovementType, { tone: 'green' | 'violet' | 'blue' | 'amber'; icon: typeof ArrowDownToLine }> = {
    receive: { tone: 'green', icon: ArrowDownToLine },
    issue: { tone: 'violet', icon: ArrowUpFromLine },
    return: { tone: 'blue', icon: RotateCcw },
    transfer: { tone: 'amber', icon: ArrowLeftRight },
    adjust_up: { tone: 'green', icon: ArrowDownToLine },
    adjust_down: { tone: 'amber', icon: ArrowUpFromLine },
};

/** Tinted icon backgrounds for the movement feed, keyed by the MV_META tone. */
const MV_TONE_BG: Record<'green' | 'violet' | 'blue' | 'amber', string> = {
    green: 'bg-emerald-500/12 text-emerald-600',
    violet: 'bg-violet-500/12 text-violet-600',
    blue: 'bg-blue-500/12 text-blue-600',
    amber: 'bg-amber-500/12 text-amber-600',
};

/** Scoped keyframes for the dashboard consoles (staggered reveal, LED pulse, live ping). */
const stockConsoleStyles = `
@keyframes sc-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes sc-led { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
@keyframes sc-ping { 75%, 100% { transform: scale(2.4); opacity: 0; } }
.sc-row { animation: sc-fade .35s ease both; }
.sc-led { box-shadow: 0 0 0 3px color-mix(in srgb, var(--destructive) 20%, transparent); animation: sc-led 1.1s ease-in-out infinite; }
.sc-ping { animation: sc-ping 1.5s cubic-bezier(0,0,.2,1) infinite; }
@media (prefers-reduced-motion: reduce) { .sc-row, .sc-led, .sc-ping { animation: none; } }
`;

const REQ_TONE: Record<StockRequestStatus, 'amber' | 'blue' | 'green' | 'red'> = {
    pending: 'amber',
    approved: 'blue',
    fulfilled: 'green',
    rejected: 'red',
};

function MovementsTab() {
    const t = useT();
    const { symbol } = useCurrency();
    const { format: fmtDateTime } = useDateTime();
    const [type, setType] = useState('all');
    const { data: movements = [], isLoading: movementsLoading } = useStockMovements(type === 'all' ? undefined : type);
    const [viewMove, setViewMove] = useState<(typeof movements)[number] | null>(null);
    // Serial codes for the movement being viewed (fetched on demand for the detail dialog).
    const { data: moveSerials = [] } = useMovementSerials(viewMove?.id ?? null);

    const columns: Column<(typeof movements)[number]>[] = [
        {
            key: 'doc_no',
            header: t('stock_doc_no'),
            render: (m) => <span className="font-mono text-xs font-semibold">{m.doc_no ?? '—'}</span>,
        },
        { key: 'moved_at', header: t('audit_time'), render: (m) => <span className="font-mono text-xs">{fmtDateTime(m.moved_at)}</span> },
        {
            key: 'type',
            header: t('stock_mv_type'),
            render: (m) => {
                const meta = MV_META[m.type];
                const Icon = meta.icon;
                return (
                    <StatusBadge tone={meta.tone}>
                        <Icon className="h-3 w-3" />
                        {t(`stock_mv_${m.type}` as Parameters<typeof t>[0])}
                    </StatusBadge>
                );
            },
        },
        {
            key: 'item',
            header: t('stock_item'),
            render: (m) => (
                <div>
                    <div className="font-mono text-xs">{m.sku}</div>
                    <div className="text-muted-foreground truncate text-xs">{m.item_name}</div>
                </div>
            ),
        },
        { key: 'qty', header: t('stock_qty'), align: 'right', render: (m) => <span className="font-mono font-bold">{m.qty}</span> },
        { key: 'from', header: t('stock_from'), render: (m) => <span className="text-sm">{m.from || '—'}</span> },
        { key: 'to', header: t('stock_to'), render: (m) => <span className="text-sm">{m.to || '—'}</span> },
        {
            key: 'reference',
            header: t('stock_reference'),
            render: (m) => <span className="text-muted-foreground font-mono text-xs">{m.reference || '—'}</span>,
        },
        { key: 'recorded_by', header: t('stock_by'), render: (m) => <span className="text-sm">{m.recorded_by || '—'}</span> },
    ];

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="w-44">
                    <SearchableSelect
                        value={type}
                        onChange={setType}
                        options={[
                            { value: 'all', label: t('stock_all_types'), search: t('stock_all_types') },
                            ...(['receive', 'issue', 'return', 'transfer'] as StockMovementType[]).map((k) => ({
                                value: k,
                                label: t(`stock_mv_${k}` as Parameters<typeof t>[0]),
                                search: t(`stock_mv_${k}` as Parameters<typeof t>[0]),
                            })),
                        ]}
                    />
                </div>
            </div>
            <DataTable columns={columns} rows={movements} rowKey={(m) => m.id} onRowClick={(m) => setViewMove(m)} loading={movementsLoading} />

            {/* Movement detail — the per-entry audit-log view. */}
            <Dialog open={!!viewMove} onOpenChange={(o) => !o && setViewMove(null)}>
                <DialogContent className="max-w-md">
                    {viewMove &&
                        (() => {
                            const meta = MV_META[viewMove.type];
                            const Icon = meta.icon;
                            const inbound = ['receive', 'return', 'adjust_up'].includes(viewMove.type);
                            return (
                                <>
                                    <DialogHeader>
                                        <DialogTitle className="flex items-start gap-3 pt-2 text-left">
                                            {/* Type icon — tinted by movement tone. */}
                                            <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', MV_TONE_BG[meta.tone])}>
                                                <Icon className="h-6 w-6" />
                                            </span>
                                            {/* Action label + timestamp, with the document number (and optional
                                                external reference) as the audit record's identity beneath. */}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="truncate text-base leading-tight font-semibold">
                                                        {t(`stock_mv_${viewMove.type}` as Parameters<typeof t>[0])}
                                                    </span>
                                                    <span className="text-muted-foreground shrink-0 font-mono text-[11px] font-normal">
                                                        {fmtDateTime(viewMove.moved_at)}
                                                    </span>
                                                </div>
                                                <div className="text-muted-foreground mt-0.5 font-mono text-[11px] font-normal">
                                                    {t('stock_doc_no')} : {viewMove.doc_no ?? '—'}
                                                </div>
                                                {viewMove.reference && (
                                                    <div className="text-muted-foreground font-mono text-[11px] font-normal">
                                                        {t('stock_reference')} : {viewMove.reference}
                                                    </div>
                                                )}
                                            </div>
                                        </DialogTitle>
                                    </DialogHeader>

                                    <div className="max-h-[72vh] space-y-4 overflow-auto">
                                        {/* Item + signed quantity */}
                                        <div className="border-border flex items-center justify-between gap-3 rounded-xl border p-3.5">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-semibold">{viewMove.item_name}</div>
                                                <div className="text-muted-foreground font-mono text-xs">SKU : {viewMove.sku}</div>
                                            </div>
                                            <div className={cn('shrink-0 font-mono text-2xl font-bold', inbound ? 'text-emerald-600' : 'text-destructive')}>
                                                {inbound ? '+' : '−'}
                                                {viewMove.qty}
                                            </div>
                                        </div>

                                        {/* Source → destination. A return has no source, so it shows just the
                                            destination warehouse; movements with a source use the From → To flow.
                                            Adjustments have neither, so nothing renders. */}
                                        {!viewMove.from && viewMove.to ? (
                                            <div className="border-border rounded-xl border p-3">
                                                <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                                    {viewMove.type === 'return' ? t('stock_to_warehouse') : t('stock_to')}
                                                </div>
                                                <div className="truncate text-sm">{viewMove.to}</div>
                                            </div>
                                        ) : viewMove.from || viewMove.to ? (
                                            <div className="border-border grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border p-3">
                                                <div className="min-w-0">
                                                    <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                                        {viewMove.type === 'receive' ? t('stock_supplier') : t('stock_from')}
                                                    </div>
                                                    <div className="truncate text-sm">{viewMove.from || '—'}</div>
                                                </div>
                                                <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" />
                                                <div className="min-w-0 text-right">
                                                    <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                                        {viewMove.type === 'receive' ? t('stock_warehouse') : t('stock_to')}
                                                    </div>
                                                    <div className="truncate text-sm">{viewMove.to || '—'}</div>
                                                </div>
                                            </div>
                                        ) : null}

                                        {/* Value: unit cost · qty · total (receive lots only) */}
                                        {viewMove.unit_cost != null && (
                                            <div>
                                                <div className="text-muted-foreground mb-1 text-[10px] tracking-wide uppercase">{t('stock_value')}</div>
                                                <div className="border-border grid grid-cols-3 overflow-hidden rounded-lg border text-center text-sm">
                                                    <div className="bg-card px-2 py-2">
                                                        <div className="text-muted-foreground text-[10px] tracking-wide uppercase">{t('stock_unit_cost')}</div>
                                                        <div className="mt-0.5 font-mono">{symbol}{viewMove.unit_cost.toLocaleString()}</div>
                                                    </div>
                                                    <div className="border-border bg-card border-l px-2 py-2">
                                                        <div className="text-muted-foreground text-[10px] tracking-wide uppercase">{t('stock_qty')}</div>
                                                        <div className="mt-0.5 font-mono">{viewMove.qty}</div>
                                                    </div>
                                                    <div className="border-border bg-card border-l px-2 py-2">
                                                        <div className="text-muted-foreground text-[10px] tracking-wide uppercase">{t('stock_mv_total')}</div>
                                                        <div className="mt-0.5 font-mono font-bold text-emerald-600">
                                                            {symbol}{(viewMove.qty * viewMove.unit_cost).toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Serial list + reprint labels (retroactive, e.g. for a Receive) */}
                                        {moveSerials.length > 0 && (
                                            <div>
                                                <div className="mb-1 flex items-center justify-between gap-2">
                                                    <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                                        {t('stock_serial_list')}
                                                    </span>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => window.open(`/api/stock-movements/${viewMove.id}/labels/pdf`, '_blank')}
                                                    >
                                                        <Printer className="h-3.5 w-3.5" />
                                                        {t('stock_print')}
                                                    </Button>
                                                </div>
                                                <div className="border-border max-h-48 overflow-auto rounded-lg border">
                                                    <table className="w-full text-sm">
                                                        <thead className="bg-muted/40 sticky top-0">
                                                            <tr className="text-muted-foreground text-left text-[10px] tracking-wide uppercase">
                                                                <th className="w-10 px-3 py-1.5">#</th>
                                                                <th className="px-3 py-1.5">{t('stock_hist_serial')}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {moveSerials.map((s, i) => (
                                                                <tr key={s} className="border-border/60 border-t">
                                                                    <td className="text-muted-foreground px-3 py-1.5 font-mono text-xs">{i + 1}</td>
                                                                    <td className="px-3 py-1.5 font-mono text-xs">{s}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* Notes */}
                                        {viewMove.notes && (
                                            <div>
                                                <div className="text-muted-foreground mb-1 text-[10px] tracking-wide uppercase">{t('stock_notes')}</div>
                                                <div className="bg-muted/40 rounded-lg p-3 text-sm">{viewMove.notes}</div>
                                            </div>
                                        )}

                                        {/* Recorded by (type-aware label) */}
                                        <div>
                                            <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                                                {t(`stock_mv_${viewMove.type}` as Parameters<typeof t>[0])} {t('stock_by')}
                                            </div>
                                            <div className="text-sm">{viewMove.recorded_by || '—'}</div>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function RequestsTab({ can, onNew }: { can: (p: string) => boolean; onNew: () => void }) {
    const t = useT();
    const { data: requests = [], isLoading: requestsLoading } = useStockRequests();
    const { approve, reject, fulfill } = useStockRequestActions();
    const [fulfillReq, setFulfillReq] = useState<StockRequest | null>(null);
    const [issueSerialIds, setIssueSerialIds] = useState<number[]>([]);
    // Warehouse filter for the serial pick list (large serialized SKUs span many warehouses).
    const [serialWh, setSerialWh] = useState<string>('all');
    // Per-warehouse qty to draw when fulfilling a quantity-only item (warehouse → qty).
    const [alloc, setAlloc] = useState<Record<string, number>>({});
    // Live item detail (on-hand + per-unit serials + balances) for the request being fulfilled.
    const { data: fulfillItem } = useStockItem(fulfillReq?.stock_item_id ?? null);

    // Reset selection and greedily pre-fill the allocation (largest warehouse first)
    // whenever a different request opens or its stock detail loads.
    useEffect(() => {
        setIssueSerialIds([]);
        setSerialWh('all');
        const bals = [...(fulfillItem?.balances ?? [])].filter((b) => b.qty > 0).sort((a, b) => b.qty - a.qty);
        let remaining = fulfillReq?.qty ?? 0;
        const next: Record<string, number> = {};
        for (const b of bals) {
            if (remaining <= 0) break;
            const take = Math.min(b.qty, remaining);
            next[b.warehouse] = take;
            remaining -= take;
        }
        setAlloc(next);
    }, [fulfillReq?.id, fulfillItem]);

    const onError = (e: unknown) => {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: msg ?? 'Something went wrong.',
            // Re-enable pointer events blocked by a parent Radix dialog/drawer (so OK is clickable).
            didOpen: () => {
                const container = Swal.getContainer();
                if (container) {
                    container.style.pointerEvents = 'auto';
                }
            },
        });
    };

    // One-line summary of the request, shown inside the confirm dialogs.
    const reqSummary = (r: (typeof requests)[number]) => `${r.sku ?? ''} — ${r.item_name ?? ''}  ·  ×${r.qty}  ·  ${r.requester_name}`;

    const confirmApprove = async (r: (typeof requests)[number]) => {
        const res = await Swal.fire({
            title: t('stock_approve_confirm'),
            text: reqSummary(r),
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: t('stock_approve'),
            cancelButtonText: t('cancel'),
            confirmButtonColor: '#059669',
            cancelButtonColor: '#6b7280',
            customClass: { popup: '!rounded-xl !shadow-xl', confirmButton: '!rounded-lg !font-medium', cancelButton: '!rounded-lg !font-medium' },
            reverseButtons: true,
        });
        if (res.isConfirmed) {
            approve.mutate(r.id, { onError });
        }
    };

    const confirmReject = async (r: (typeof requests)[number]) => {
        const res = await Swal.fire({
            title: t('stock_reject_confirm'),
            text: reqSummary(r),
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: t('stock_reject'),
            cancelButtonText: t('cancel'),
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            customClass: { popup: '!rounded-xl !shadow-xl', confirmButton: '!rounded-lg !font-medium', cancelButton: '!rounded-lg !font-medium' },
            reverseButtons: true,
        });
        if (res.isConfirmed) {
            reject.mutate(r.id, { onError });
        }
    };

    const columns: Column<(typeof requests)[number]>[] = [
        {
            key: 'id',
            header: t('stock_request_no'),
            render: (r) => <span className="font-mono text-xs font-semibold">{r.reference ?? `REQ-${String(r.id).padStart(4, '0')}`}</span>,
        },
        { key: 'requester', header: t('stock_requester'), render: (r) => <span className="text-sm font-medium">{r.requester_name}</span> },
        {
            key: 'item',
            header: t('stock_item'),
            render: (r) => (
                <div>
                    <div className="font-mono text-xs">{r.sku}</div>
                    <div className="text-muted-foreground truncate text-xs">{r.item_name}</div>
                </div>
            ),
        },
        { key: 'qty', header: t('stock_qty'), align: 'right', render: (r) => <span className="font-mono font-bold">{r.qty}</span> },
        { key: 'reason', header: t('stock_reason'), render: (r) => <span className="text-sm">{r.reason}</span> },
        {
            key: 'status',
            header: t('status'),
            render: (r) => <StatusBadge tone={REQ_TONE[r.status]}>{t(`stock_rq_${r.status}` as Parameters<typeof t>[0])}</StatusBadge>,
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (r) => (
                <div className="flex justify-end gap-1.5">
                    {can('approve') && r.status === 'pending' && (
                        <>
                            <Button size="sm" variant="outline" onClick={() => confirmApprove(r)}>
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                                {t('stock_approve')}
                            </Button>
                            <Button size="sm" variant="outline" title={t('stock_reject')} onClick={() => confirmReject(r)}>
                                <X className="text-destructive h-3.5 w-3.5" />
                            </Button>
                        </>
                    )}
                    {can('fulfill') && r.status === 'approved' && (
                        <Button size="sm" onClick={() => setFulfillReq(r)}>
                            <ArrowUpFromLine className="h-3.5 w-3.5" />
                            {t('stock_fulfill')}
                        </Button>
                    )}
                    {(r.status === 'fulfilled' || r.status === 'rejected') && <span className="text-muted-foreground text-xs">—</span>}
                </div>
            ),
        },
    ];

    // Fulfill dialog derivations.
    const fulfillSerialized = !!fulfillItem?.track_serial;
    // Warehouses holding stock for this item — the rows of the allocation grid.
    const fulfillBalances = (fulfillItem?.balances ?? []).filter((b) => b.qty > 0);
    const totalAvailable = fulfillBalances.reduce((s, b) => s + b.qty, 0);
    // Serialized: every in-stock serial is pickable, across all warehouses, ordered
    // FIFO (oldest received first) so the top of the list is what should go out first.
    const fulfillInStock = (fulfillItem?.serials ?? [])
        .filter((s) => s.status === 'in_stock')
        .sort((a, b) => (a.received_at ?? '').localeCompare(b.received_at ?? ''));
    // Per-warehouse counts for the filter chips.
    const serialWhCounts = fulfillInStock.reduce<Record<string, number>>((m, s) => {
        const k = s.warehouse ?? '—';
        m[k] = (m[k] ?? 0) + 1;
        return m;
    }, {});
    const visibleSerials = serialWh === 'all' ? fulfillInStock : fulfillInStock.filter((s) => (s.warehouse ?? '—') === serialWh);
    // Auto-pick the oldest `qty` serials (pure FIFO across all warehouses) in one click.
    const pickFifo = () => setIssueSerialIds(fulfillInStock.slice(0, fulfillReq?.qty ?? 0).map((s) => s.id));
    const allocTotal = Object.values(alloc).reduce((s, n) => s + n, 0);
    // Ready when the chosen units cover exactly the requested qty.
    const fulfillReady = fulfillSerialized ? !!fulfillReq && issueSerialIds.length === fulfillReq.qty : !!fulfillReq && allocTotal === fulfillReq.qty;
    const toggleIssueSerial = (id: number) => setIssueSerialIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    const setAllocFor = (warehouse: string, max: number, raw: number) =>
        setAlloc((a) => ({ ...a, [warehouse]: Math.max(0, Math.min(max, Math.trunc(raw) || 0)) }));

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-muted-foreground text-sm">{t('stock_requests_caption')}</div>
                {can('request') && (
                    <Button onClick={onNew}>
                        <FilePlus2 className="h-4 w-4" />
                        {t('stock_request')}
                    </Button>
                )}
            </div>
            <DataTable columns={columns} rows={requests} rowKey={(r) => r.id} loading={requestsLoading} />

            {/* Fulfill — review the deduction and issue stock to the requester from here. */}
            <Dialog open={!!fulfillReq} onOpenChange={(o) => !o && setFulfillReq(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ArrowUpFromLine className="h-5 w-5 text-violet-600" />
                            {t('stock_fulfill')}
                        </DialogTitle>
                    </DialogHeader>
                    {fulfillReq && (
                        <div className="space-y-4">
                            <div className="border-border rounded-lg border p-3">
                                <div className="text-sm font-semibold">{fulfillReq.item_name}</div>
                                <div className="text-muted-foreground font-mono text-xs">
                                    {fulfillReq.sku} · {t('stock_requester')}: {fulfillReq.requester_name}
                                </div>
                            </div>

                            {/* Quantity-only: spread the issue across warehouses (greedy pre-fill, editable). */}
                            {!fulfillSerialized && (
                                <div className="border-border overflow-hidden rounded-lg border">
                                    <div className="border-border bg-muted/30 flex items-center justify-between border-b px-3 py-2">
                                        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                            {t('stock_issue_from')}
                                        </span>
                                        <span className={cn('font-mono text-xs', fulfillReady ? 'text-emerald-600' : 'text-muted-foreground')}>
                                            {allocTotal}/{fulfillReq.qty}
                                        </span>
                                    </div>
                                    {fulfillBalances.length === 0 ? (
                                        <div className="text-muted-foreground py-6 text-center text-xs">{t('stock_no_stock')}</div>
                                    ) : (
                                        fulfillBalances.map((b) => (
                                            <div
                                                key={b.warehouse}
                                                className="border-border/60 flex items-center gap-3 border-b px-3 py-2 last:border-0"
                                            >
                                                <span className="flex-1 text-sm">{b.warehouse}</span>
                                                <span className="text-muted-foreground font-mono text-xs">
                                                    {b.qty} {fulfillItem?.unit}
                                                </span>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={b.qty}
                                                    value={alloc[b.warehouse] ?? 0}
                                                    onChange={(e) => setAllocFor(b.warehouse, b.qty, +e.target.value)}
                                                    className="h-8 w-20 text-right font-mono"
                                                />
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {totalAvailable < fulfillReq.qty && (
                                <div className="border-destructive/40 bg-destructive/5 text-destructive flex items-center gap-2 rounded-lg border p-3 text-sm">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    {t('stock_insufficient')} ({totalAvailable})
                                </div>
                            )}

                            {/* Serialized: pick exactly the units (serials) that go out — across any warehouse. */}
                            {fulfillSerialized && (
                                <div className="border-border overflow-hidden rounded-lg border">
                                    <div className="border-border bg-muted/30 flex items-center justify-between border-b px-3 py-2">
                                        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                                            {t('stock_pick_serials')}
                                        </span>
                                        <div className="flex items-center gap-2.5">
                                            <button
                                                type="button"
                                                onClick={pickFifo}
                                                className="text-brand hover:text-brand/80 text-xs font-medium transition-colors"
                                            >
                                                {t('stock_pick_fifo')} ({fulfillReq.qty})
                                            </button>
                                            <span className={cn('font-mono text-xs', fulfillReady ? 'text-emerald-600' : 'text-muted-foreground')}>
                                                {issueSerialIds.length}/{fulfillReq.qty}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Warehouse filter — only when serials span more than one warehouse. */}
                                    {Object.keys(serialWhCounts).length > 1 && (
                                        <div className="border-border/60 flex flex-wrap gap-1.5 border-b px-3 py-2">
                                            {[['all', fulfillInStock.length] as const, ...Object.entries(serialWhCounts)].map(([wh, n]) => (
                                                <button
                                                    key={wh}
                                                    type="button"
                                                    onClick={() => setSerialWh(wh as string)}
                                                    className={cn(
                                                        'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                                                        serialWh === wh
                                                            ? 'border-brand bg-brand/10 text-brand'
                                                            : 'border-border text-muted-foreground hover:bg-accent/50',
                                                    )}
                                                >
                                                    {wh === 'all' ? t('stock_all_warehouses') : (wh as string)}{' '}
                                                    <span className="font-mono opacity-70">{n}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="max-h-48 overflow-auto">
                                        {visibleSerials.length === 0 ? (
                                            <div className="text-muted-foreground py-6 text-center text-xs">{t('stock_no_serials')}</div>
                                        ) : (
                                            visibleSerials.map((s) => {
                                                const checked = issueSerialIds.includes(s.id);
                                                // Block extra picks once the requested qty is reached.
                                                const atLimit = !checked && issueSerialIds.length >= fulfillReq.qty;
                                                return (
                                                    <button
                                                        key={s.id}
                                                        type="button"
                                                        disabled={atLimit}
                                                        onClick={() => toggleIssueSerial(s.id)}
                                                        className="hover:bg-accent/40 border-border/60 flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-0 disabled:opacity-40"
                                                    >
                                                        <span
                                                            className={cn(
                                                                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                                                checked ? 'bg-brand border-brand text-white' : 'border-input',
                                                            )}
                                                        >
                                                            {checked && <Check className="h-3 w-3" />}
                                                        </span>
                                                        <span className="flex-1 font-mono text-xs">{s.serial}</span>
                                                        <span className="text-muted-foreground text-[11px]">{s.warehouse ?? '—'}</span>
                                                        {s.received_at && (
                                                            <span className="text-muted-foreground font-mono text-[11px]">
                                                                {s.received_at.slice(0, 10)}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFulfillReq(null)} disabled={fulfill.isPending}>
                            {t('cancel')}
                        </Button>
                        <Button
                            disabled={!fulfillReq || !fulfillReady || fulfill.isPending}
                            onClick={() =>
                                fulfillReq &&
                                fulfill.mutate(
                                    {
                                        id: fulfillReq.id,
                                        serialIds: fulfillSerialized ? issueSerialIds : undefined,
                                        allocations: fulfillSerialized
                                            ? undefined
                                            : Object.entries(alloc)
                                                  .filter(([, q]) => q > 0)
                                                  .map(([warehouse, qty]) => ({ warehouse, qty })),
                                    },
                                    { onError, onSuccess: () => setFulfillReq(null) },
                                )
                            }
                        >
                            <ArrowUpFromLine className="h-4 w-4" />
                            {t('stock_fulfill_deduct')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** Stock Count / Audit: open a session, enter physical counts, commit adjustments. */
function AuditTab({ can }: { can: (p: string) => boolean }) {
    const t = useT();
    const { data: sessions = [], isLoading: sessionsLoading } = useStockCounts(can('audit'));
    const { open, save, commit, cancel } = useStockCountMutations();
    const { data: warehouses = [] } = useWarehouses();
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const { data: session } = useStockCount(selectedId);
    const { data: allItems = [] } = useStockItems({});
    const [creating, setCreating] = useState(false);
    const [wh, setWh] = useState('all');
    const [cat, setCat] = useState('all');
    const [selectedSkus, setSelectedSkus] = useState<number[]>([]);
    const [skuSearch, setSkuSearch] = useState('');
    const [entries, setEntries] = useState<Record<number, string>>({});
    const [mode, setMode] = useState<StockCountAdjustMode>('auto');
    // Per-button busy flags so a standalone Save draft never spins the Commit button (and vice-versa).
    const [savingDraft, setSavingDraft] = useState(false);
    const [committing, setCommitting] = useState(false);
    // Brief success flash on the Commit button (the sheet flips to committed view right after).
    const [committedFlash, setCommittedFlash] = useState(false);
    // Serial verification (Auto): serialized lines that came up short need their missing units ticked.
    type SerialCheckItem = { stock_item_id: number; sku: string | null; name: string | null; need: number; serials: { id: number; serial: string }[] };
    const [serialCheck, setSerialCheck] = useState<SerialCheckItem[] | null>(null);
    const [missingByItem, setMissingByItem] = useState<Record<number, number[]>>({});

    const toggleSerial = (itemId: number, serialId: number) =>
        setMissingByItem((prev) => {
            const cur = prev[itemId] ?? [];
            return { ...prev, [itemId]: cur.includes(serialId) ? cur.filter((x) => x !== serialId) : [...cur, serialId] };
        });

    const serialCheckOk = (serialCheck ?? []).every((it) => (missingByItem[it.stock_item_id] ?? []).length === it.need);

    // Persist on-screen counts, then commit with the chosen mode + any ticked-missing serials.
    const runCommit = async (missing: Record<number, number[]>) => {
        if (!session) return;
        setCommitting(true);
        try {
            await save.mutateAsync({ id: session.id, counts: countsPayload() });
            await commit.mutateAsync({ id: session.id, mode, missingSerials: missing });
            setCommittedFlash(true);
            window.setTimeout(() => setCommittedFlash(false), 1200);
        } catch (e) {
            onError(e);
        } finally {
            setCommitting(false);
            setSerialCheck(null);
        }
    };

    const onError = (e: unknown) => {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: msg ?? 'Something went wrong.',
            // Re-enable pointer events blocked by a parent Radix dialog/drawer (so OK is clickable).
            didOpen: () => {
                const container = Swal.getContainer();
                if (container) {
                    container.style.pointerEvents = 'auto';
                }
            },
        });
    };

    // Seed the inputs from the session's stored counts whenever it loads/changes.
    useEffect(() => {
        if (!session) return;
        const seed: Record<number, string> = {};
        (session.lines ?? []).forEach((l) => {
            seed[l.id] = l.counted_qty === null ? '' : String(l.counted_qty);
        });
        setEntries(seed);
    }, [session?.id, session?.status]);

    // Reset the New count picker back to its defaults.
    const resetPicker = () => {
        setCreating(false);
        setWh('all');
        setCat('all');
        setSelectedSkus([]);
        setSkuSearch('');
    };

    const start = async () => {
        if (selectedSkus.length === 0) return;
        try {
            const created = await open.mutateAsync({
                warehouse: wh === 'all' ? null : wh,
                category: cat === 'all' ? null : cat,
                stock_item_ids: selectedSkus,
            });
            setSelectedId(created.id);
        } catch (e) {
            onError(e);
        } finally {
            resetPicker();
        }
    };

    const countsPayload = (): Record<number, number | null> => {
        const out: Record<number, number | null> = {};
        Object.entries(entries).forEach(([id, v]) => {
            out[Number(id)] = v.trim() === '' ? null : Math.max(0, parseInt(v, 10) || 0);
        });
        return out;
    };

    const statusTone = (s: string) => (s === 'committed' ? 'green' : s === 'canceled' ? 'gray' : 'amber');

    // ── New count picker: warehouse → categories with stock → selectable SKUs ──
    // "In warehouse W" = the SKU holds stock there (per-warehouse balances).
    const inWarehouse = (i: StockItem, w: string) => (i.balances ?? []).some((b) => b.warehouse === w && b.qty > 0);
    const itemsInWh = wh === 'all' ? allItems : allItems.filter((i) => inWarehouse(i, wh));
    const warehouseOptions = [
        { value: 'all', label: `${t('stock_count_all_wh')} (${allItems.length})`, search: t('stock_count_all_wh') },
        ...warehouses.map((w) => ({
            value: w.name,
            label: `${w.name} (${allItems.filter((i) => inWarehouse(i, w.name)).length})`,
            search: w.name,
        })),
    ];
    const catCounts = itemsInWh.reduce<Record<string, number>>((acc, i) => {
        const c = i.category ?? '—';
        acc[c] = (acc[c] ?? 0) + 1;
        return acc;
    }, {});
    const categoryOptions = [
        { value: 'all', label: `${t('stock_count_all_cat')} (${itemsInWh.length})`, search: t('stock_count_all_cat') },
        ...Object.entries(catCounts).map(([c, n]) => ({ value: c, label: `${c} (${n})`, search: c })),
    ];
    const skuList = (cat === 'all' ? itemsInWh : itemsInWh.filter((i) => (i.category ?? '—') === cat)).filter(
        (i) => !skuSearch || `${i.sku} ${i.name}`.toLowerCase().includes(skuSearch.toLowerCase()),
    );
    const allVisibleSelected = skuList.length > 0 && skuList.every((i) => selectedSkus.includes(i.id));
    const toggleSku = (id: number) => setSelectedSkus((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    const toggleAllVisible = () => {
        const ids = skuList.map((i) => i.id);
        setSelectedSkus((prev) => (allVisibleSelected ? prev.filter((x) => !ids.includes(x)) : [...new Set([...prev, ...ids])]));
    };
    // Switching warehouse resets the category + selection (a SKU lives in one warehouse).
    const onPickWarehouse = (v: string) => {
        setWh(v);
        setCat('all');
        setSelectedSkus([]);
    };

    // ── Session list + create form (count sheet opens in a dialog) ──
    const isDraft = session?.status === 'draft';
    const anyCounted = Object.values(entries).some((v) => v.trim() !== '');

    // Live audit summary for the open sheet: counted progress, # of discrepancies, net variance.
    // In draft it reflects what's typed (entries); once committed it reads the stored line values.
    const countSummary = (() => {
        const lines = session?.lines ?? [];
        let counted = 0;
        let discrepancies = 0;
        let net = 0;
        for (const l of lines) {
            const raw = entries[l.id] ?? '';
            const lineVariance = isDraft ? (raw.trim() === '' ? null : (parseInt(raw, 10) || 0) - l.system_qty) : l.variance;
            const lineCounted = isDraft ? raw.trim() !== '' : l.counted_qty !== null;
            if (lineCounted) counted++;
            if (lineVariance !== null && lineVariance !== 0) {
                discrepancies++;
                net += lineVariance;
            }
        }
        return { total: lines.length, counted, discrepancies, net };
    })();

    // A session with any serialized line must commit with Auto (Manual can't reconcile serials).
    const hasSerial = (session?.lines ?? []).some((l) => l.track_serial);
    useEffect(() => {
        if (hasSerial) setMode('auto');
    }, [hasSerial]);

    // Columns mirror the shared DataTable used by the other Stock tabs.
    const sessionColumns: Column<(typeof sessions)[number]>[] = [
        {
            key: 'reference',
            header: t('stock_doc_no'),
            className: 'whitespace-nowrap',
            render: (s) => <span className="font-mono text-xs font-semibold">{s.reference}</span>,
        },
        {
            key: 'created_at',
            header: t('audit_time'),
            className: 'whitespace-nowrap',
            render: (s) => <span className="text-muted-foreground font-mono text-xs">{s.created_at?.slice(0, 10)}</span>,
        },
        {
            key: 'warehouse',
            header: t('stock_warehouse'),
            className: 'whitespace-nowrap',
            // No specific warehouse = the count spanned every warehouse.
            render: (s) => <span className="text-sm">{s.warehouse || t('stock_count_all_wh')}</span>,
        },
        {
            key: 'progress',
            header: t('stock_count_progress'),
            className: 'whitespace-nowrap',
            render: (s) => (
                <span className="font-mono text-xs">
                    {s.counted_lines ?? 0}/{s.line_count ?? 0}
                </span>
            ),
        },
        // Empty spacer soaks up the slack: left group stays tight, right group hugs the edge.
        { key: 'spacer', header: '', className: 'w-full', render: () => null },
        {
            key: 'status',
            header: t('status'),
            className: 'whitespace-nowrap',
            render: (s) => <StatusBadge tone={statusTone(s.status)}>{t(`stock_count_${s.status}` as Parameters<typeof t>[0])}</StatusBadge>,
        },
        {
            key: 'adjust_mode',
            header: t('stock_count_adjust_by'),
            className: 'whitespace-nowrap',
            // Only committed counts carry a mode; drafts/canceled show nothing yet.
            render: (s) =>
                s.status === 'committed' && s.adjust_mode ? (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                        {s.adjust_mode === 'manual' ? <FileText className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                        {s.adjust_mode === 'manual' ? t('stock_count_mode_badge_manual') : t('stock_count_mode_badge_auto')}
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (s) =>
                s.status === 'draft' && can('audit') ? (
                    <button
                        // Cancel a draft session — confirm first, and stop the row's open-on-click.
                        onClick={async (e) => {
                            e.stopPropagation();
                            const res = await Swal.fire({
                                title: t('stock_count_cancel'),
                                text: `${s.reference} — ${t('stock_count_cancel_confirm')}`,
                                icon: 'warning',
                                showCancelButton: true,
                                confirmButtonText: t('stock_count_cancel'),
                                cancelButtonText: t('stock_count_back'),
                                confirmButtonColor: '#ef4444',
                                cancelButtonColor: '#6b7280',
                                customClass: {
                                    popup: '!rounded-xl !shadow-xl',
                                    confirmButton: '!rounded-lg !font-medium',
                                    cancelButton: '!rounded-lg !font-medium',
                                },
                                reverseButtons: true,
                            });
                            if (res.isConfirmed) {
                                cancel.mutate(s.id, { onError });
                            }
                        }}
                        title={t('stock_count_cancel')}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                ) : null,
        },
    ];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-muted-foreground text-sm">{t('stock_counting_system')}</div>
                {can('audit') && (
                    <Button onClick={() => setCreating(true)}>
                        <ClipboardList className="h-4 w-4" />
                        {t('stock_count_action')}
                    </Button>
                )}
            </div>

            <DataTable
                columns={sessionColumns}
                rows={sessions}
                rowKey={(s) => s.id}
                onRowClick={(s) => setSelectedId(s.id)}
                loading={sessionsLoading}
            />

            {/* New count — warehouse → categories (with stock) → pick the SKUs to count. */}
            <Dialog open={creating} onOpenChange={(o) => !o && resetPicker()}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t('stock_new_count')}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {/* Scope: warehouse + category (counts show what actually has stock) */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <div className="text-muted-foreground mb-1 text-xs font-medium">{t('stock_warehouse')}</div>
                                <SearchableSelect value={wh} onChange={onPickWarehouse} options={warehouseOptions} />
                            </div>
                            <div>
                                <div className="text-muted-foreground mb-1 text-xs font-medium">{t('stock_category')}</div>
                                <SearchableSelect value={cat} onChange={setCat} options={categoryOptions} />
                            </div>
                        </div>

                        {/* SKU picker */}
                        <div className="border-border overflow-hidden rounded-xl border">
                            <div className="border-border bg-muted/30 flex items-center gap-3 border-b px-3 py-2">
                                <button
                                    type="button"
                                    onClick={toggleAllVisible}
                                    disabled={skuList.length === 0}
                                    className="flex items-center gap-2 text-sm font-medium disabled:opacity-40"
                                >
                                    <span
                                        className={cn(
                                            'flex h-4 w-4 items-center justify-center rounded border',
                                            allVisibleSelected ? 'bg-brand border-brand text-white' : 'border-input',
                                        )}
                                    >
                                        {allVisibleSelected && <Check className="h-3 w-3" />}
                                    </span>
                                    {t('stock_select_all')}
                                </button>
                                <span className="text-muted-foreground text-xs">
                                    {selectedSkus.length} {t('stock_count_selected')}
                                </span>
                                <div className="relative ml-auto w-44">
                                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                                    <Input
                                        value={skuSearch}
                                        onChange={(e) => setSkuSearch(e.target.value)}
                                        placeholder={t('stock_search')}
                                        className="h-8 pl-8 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="max-h-72 overflow-auto">
                                {skuList.length === 0 ? (
                                    <div className="text-muted-foreground py-10 text-center text-sm">{t('stock_count_empty_scope')}</div>
                                ) : (
                                    skuList.map((i) => {
                                        const checked = selectedSkus.includes(i.id);
                                        return (
                                            <button
                                                key={i.id}
                                                type="button"
                                                onClick={() => toggleSku(i.id)}
                                                className="hover:bg-accent/40 border-border/60 flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-0"
                                            >
                                                <span
                                                    className={cn(
                                                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                                        checked ? 'bg-brand border-brand text-white' : 'border-input',
                                                    )}
                                                >
                                                    {checked && <Check className="h-3 w-3" />}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-mono text-xs">{i.sku}</div>
                                                    <div className="text-muted-foreground truncate text-xs">{i.name}</div>
                                                </div>
                                                <span className="text-muted-foreground shrink-0 text-xs">{i.category ?? '—'}</span>
                                                <span className="w-12 shrink-0 text-right font-mono text-sm font-semibold">{i.current_stock}</span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={resetPicker}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={start} disabled={open.isPending || selectedSkus.length === 0}>
                            {t('stock_count_start')}
                            {selectedSkus.length > 0 && ` (${selectedSkus.length})`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Count sheet — opens in a dialog when a session row is clicked. */}
            <Dialog open={selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
                <DialogContent
                    className="max-w-3xl"
                    // The commit-confirm Swal renders at <body> (outside this content). While it's open,
                    // neither Esc nor clicking its buttons (an "outside" interaction) should close this sheet.
                    onEscapeKeyDown={(e) => {
                        if (Swal.isVisible()) {
                            e.preventDefault();
                        }
                    }}
                    onInteractOutside={(e) => {
                        if (Swal.isVisible()) {
                            e.preventDefault();
                        }
                    }}
                >
                    {session ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="space-y-1">
                                    {/* Title + status on top; reference drops to its own line below. */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-base font-semibold">{t('stock_count_sheet_title')}</span>
                                        <StatusBadge tone={statusTone(session.status)}>
                                            {t(`stock_count_${session.status}` as Parameters<typeof t>[0])}
                                        </StatusBadge>
                                        {session.status === 'committed' && session.adjust_mode && (
                                            <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px] font-normal">
                                                {session.adjust_mode === 'manual' ? <FileText className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                                                {session.adjust_mode === 'manual' ? t('stock_count_mode_badge_manual') : t('stock_count_mode_badge_auto')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-muted-foreground font-mono text-xs font-semibold">{session.reference}</span>
                                        <span className="text-muted-foreground text-xs font-normal">· {session.warehouse || t('stock_count_all_wh')}</span>
                                    </div>
                                </DialogTitle>
                            </DialogHeader>

                            {/* Audit summary — counted progress, discrepancy count, net variance. */}
                            <div className="border-border grid grid-cols-3 gap-px overflow-hidden rounded-lg border">
                                <div className="bg-card px-3 py-2 text-center">
                                    <div className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                                        {t('stock_count_sum_progress')}
                                    </div>
                                    <div className="mt-0.5 font-mono text-sm font-semibold">
                                        {countSummary.counted}
                                        <span className="text-muted-foreground">/{countSummary.total}</span>
                                    </div>
                                </div>
                                <div className="bg-card px-3 py-2 text-center">
                                    <div className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                                        {t('stock_count_sum_discrepancies')}
                                    </div>
                                    <div
                                        className={cn(
                                            'mt-0.5 font-mono text-sm font-semibold',
                                            countSummary.discrepancies > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                                        )}
                                    >
                                        {countSummary.discrepancies}
                                    </div>
                                </div>
                                <div className="bg-card px-3 py-2 text-center">
                                    <div className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                                        {t('stock_count_sum_net')}
                                    </div>
                                    <div
                                        className={cn(
                                            'mt-0.5 font-mono text-sm font-semibold',
                                            countSummary.net > 0
                                                ? 'text-emerald-600'
                                                : countSummary.net < 0
                                                  ? 'text-destructive'
                                                  : 'text-muted-foreground',
                                        )}
                                    >
                                        {countSummary.net > 0 ? `+${countSummary.net}` : countSummary.net}
                                    </div>
                                </div>
                            </div>

                            <div className="max-h-[60vh] overflow-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/40 sticky top-0 z-10 backdrop-blur">
                                        <tr className="border-border text-muted-foreground border-b text-left text-[11px] font-semibold tracking-wide uppercase">
                                            <th className="w-full px-3 py-2">{t('stock_item')}</th>
                                            <th className="w-24 px-3 py-2 text-right whitespace-nowrap">{t('stock_count_system')}</th>
                                            <th className="w-28 px-3 py-2 text-right whitespace-nowrap">{t('stock_count_counted')}</th>
                                            <th className="w-28 px-3 py-2 text-right whitespace-nowrap">{t('stock_count_variance')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(session.lines ?? []).map((l) => {
                                            const entered = entries[l.id] ?? '';
                                            const variance = isDraft
                                                ? entered.trim() === ''
                                                    ? null
                                                    : (parseInt(entered, 10) || 0) - l.system_qty
                                                : l.variance;
                                            return (
                                                <tr
                                                    key={l.id}
                                                    className={cn(
                                                        'border-border/60 border-b transition-colors last:border-0',
                                                        variance !== null && variance !== 0
                                                            ? variance > 0
                                                                ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                                                                : 'bg-red-50/40 dark:bg-red-950/20'
                                                            : 'hover:bg-muted/30',
                                                    )}
                                                >
                                                    <td className="px-3 py-2">
                                                        <div className="flex items-center gap-2">
                                                            {/* State dot: hollow = uncounted, green = over, red = short, grey = matched. */}
                                                            <span
                                                                className={cn(
                                                                    'h-1.5 w-1.5 shrink-0 rounded-full',
                                                                    variance === null
                                                                        ? 'border-muted-foreground/40 border'
                                                                        : variance > 0
                                                                          ? 'bg-emerald-500'
                                                                          : variance < 0
                                                                            ? 'bg-destructive'
                                                                            : 'bg-muted-foreground/40',
                                                                )}
                                                            />
                                                            <div className="min-w-0">
                                                                <div className="font-mono text-xs font-medium">{l.sku}</div>
                                                                <div className="text-muted-foreground truncate text-xs">{l.name}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="text-muted-foreground px-3 py-2 text-right font-mono tabular-nums">{l.system_qty}</td>
                                                    <td className="px-3 py-2 text-right">
                                                        {isDraft ? (
                                                            <Input
                                                                inputMode="numeric"
                                                                value={entered}
                                                                placeholder="0"
                                                                onChange={(e) =>
                                                                    setEntries((p) => ({ ...p, [l.id]: e.target.value.replace(/[^\d]/g, '') }))
                                                                }
                                                                className={cn(
                                                                    'ml-auto h-8 w-20 text-right font-mono tabular-nums',
                                                                    variance !== null && variance !== 0 && 'border-primary/50',
                                                                )}
                                                            />
                                                        ) : (
                                                            <span className="font-mono tabular-nums">{l.counted_qty ?? '—'}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        {variance === null ? (
                                                            <span className="text-muted-foreground">—</span>
                                                        ) : (
                                                            <span
                                                                className={cn(
                                                                    'inline-flex min-w-[2.75rem] justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums',
                                                                    variance > 0
                                                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                                                        : variance < 0
                                                                          ? 'text-destructive bg-red-100 dark:bg-red-950/40'
                                                                          : 'text-muted-foreground bg-muted',
                                                                )}
                                                            >
                                                                {variance > 0 ? `+${variance}` : variance}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {(isDraft || committedFlash) && can('audit') && (
                                <>
                                    {/* Commit mode — segmented choice with a fixed contextual hint (no layout jump). */}
                                    <div className="border-border space-y-2.5 rounded-lg border p-3">
                                        <div className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                                            {t('stock_count_mode_label')}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(['auto', 'manual'] as const).map((m) => {
                                                const active = mode === m;
                                                const disabled = m === 'manual' && hasSerial;
                                                const Icon = m === 'auto' ? Zap : FileText;
                                                return (
                                                    <button
                                                        key={m}
                                                        type="button"
                                                        disabled={disabled}
                                                        onClick={() => !disabled && setMode(m)}
                                                        aria-pressed={active}
                                                        className={cn(
                                                            'flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition',
                                                            disabled
                                                                ? 'border-border text-muted-foreground/40 cursor-not-allowed'
                                                                : active
                                                                  ? m === 'manual'
                                                                      ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-400'
                                                                      : 'border-primary bg-primary/10 text-primary'
                                                                  : 'border-border text-muted-foreground hover:bg-muted/50',
                                                        )}
                                                    >
                                                        <Icon className="h-4 w-4" />
                                                        {t(m === 'auto' ? 'stock_count_mode_auto_name' : 'stock_count_mode_manual_name')}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {hasSerial && (
                                            <div className="text-muted-foreground text-[11px]">{t('stock_count_serial_only_auto')}</div>
                                        )}
                                        {/* Hint stays mounted so selecting Manual never shifts the layout. */}
                                        <div
                                            className={cn(
                                                'flex items-start gap-2 text-[11px] leading-snug transition-colors',
                                                mode === 'manual' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
                                            )}
                                        >
                                            {mode === 'manual' ? (
                                                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                                            ) : (
                                                <Zap className="mt-px h-3.5 w-3.5 shrink-0" />
                                            )}
                                            <span>{mode === 'manual' ? t('stock_count_mode_manual_warn') : t('stock_count_mode_auto_hint')}</span>
                                        </div>
                                    </div>
                                    <DialogFooter className="sm:justify-between">
                                        <Button
                                            variant="outline"
                                            disabled={savingDraft || committing}
                                            onClick={async () => {
                                                setSavingDraft(true);
                                                try {
                                                    await save.mutateAsync({ id: session.id, counts: countsPayload() });
                                                } catch (e) {
                                                    onError(e);
                                                } finally {
                                                    setSavingDraft(false);
                                                }
                                            }}
                                        >
                                            {savingDraft && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                            {t('stock_count_save')}
                                        </Button>
                                        <Button
                                            disabled={!anyCounted || savingDraft || committing || committedFlash}
                                            onClick={async () => {
                                                // Confirm once more — message reflects the chosen mode's effect on stock.
                                                const res = await Swal.fire({
                                                    title: t('stock_count_commit_confirm'),
                                                    text: `${session.reference} — ${mode === 'manual' ? t('stock_count_mode_manual_warn') : t('stock_count_mode_auto_hint')}`,
                                                    icon: mode === 'manual' ? 'warning' : 'question',
                                                    showCancelButton: true,
                                                    confirmButtonText: t('stock_count_commit'),
                                                    cancelButtonText: t('stock_count_back'),
                                                    confirmButtonColor: mode === 'manual' ? '#d97706' : '#16a34a',
                                                    cancelButtonColor: '#6b7280',
                                                    reverseButtons: true,
                                                    customClass: {
                                                        popup: '!rounded-xl !shadow-xl',
                                                        confirmButton: '!rounded-lg !font-medium',
                                                        cancelButton: '!rounded-lg !font-medium',
                                                    },
                                                    // Re-enable pointer events blocked by the parent Radix dialog.
                                                    didOpen: () => {
                                                        const container = Swal.getContainer();
                                                        if (container) {
                                                            container.style.pointerEvents = 'auto';
                                                        }
                                                    },
                                                });
                                                if (!res.isConfirmed) {
                                                    return;
                                                }

                                                // Serialized lines that came up short must have their missing units ticked first.
                                                const shorts: SerialCheckItem[] = (session.lines ?? [])
                                                    .filter((l) => l.track_serial)
                                                    .map((l) => {
                                                        const entered = entries[l.id] ?? '';
                                                        const variance = entered.trim() === '' ? 0 : (parseInt(entered, 10) || 0) - l.system_qty;
                                                        return { l, variance };
                                                    })
                                                    .filter((x) => x.variance < 0)
                                                    .map((x) => ({
                                                        stock_item_id: x.l.stock_item_id,
                                                        sku: x.l.sku,
                                                        name: x.l.name,
                                                        need: -x.variance,
                                                        serials: x.l.serials ?? [],
                                                    }));

                                                if (shorts.length === 0) {
                                                    await runCommit({});
                                                    return;
                                                }
                                                setMissingByItem({});
                                                setSerialCheck(shorts);
                                            }}
                                        >
                                            {committing ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : committedFlash ? (
                                                <Check className="h-3.5 w-3.5" />
                                            ) : null}
                                            {committedFlash ? t('stock_count_committed') : t('stock_count_commit')}
                                        </Button>
                                    </DialogFooter>
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Radix requires a DialogTitle even while the session loads. */}
                            <DialogHeader>
                                <DialogTitle className="text-base font-semibold">{t('stock_count_sheet_title')}</DialogTitle>
                            </DialogHeader>
                            <div className="flex items-center justify-center py-16">
                                <div className="border-muted-foreground/30 border-t-primary h-6 w-6 animate-spin rounded-full border-2" />
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Serial verification — tick the not-found units before an Auto commit adjusts stock. */}
            <Dialog open={serialCheck !== null} onOpenChange={(o) => !o && setSerialCheck(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t('stock_count_serial_verify_title')}</DialogTitle>
                    </DialogHeader>
                    <div className="text-muted-foreground text-xs">{t('stock_count_serial_verify_hint')}</div>
                    <div className="max-h-[60vh] space-y-3 overflow-auto">
                        {(serialCheck ?? []).map((it) => {
                            const ticked = missingByItem[it.stock_item_id] ?? [];
                            const ok = ticked.length === it.need;
                            return (
                                <div key={it.stock_item_id} className="border-border rounded-lg border p-3">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-mono text-xs font-medium">{it.sku}</div>
                                            <div className="text-muted-foreground truncate text-xs">{it.name}</div>
                                        </div>
                                        <span className={cn('shrink-0 text-[11px] font-semibold', ok ? 'text-emerald-600' : 'text-amber-600')}>
                                            {t('stock_count_serial_tick_n').replace('{n}', String(it.need))} ({ticked.length}/{it.need})
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {it.serials.map((s) => {
                                            const checked = ticked.includes(s.id);
                                            return (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => toggleSerial(it.stock_item_id, s.id)}
                                                    className={cn(
                                                        'flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition',
                                                        checked ? 'border-destructive bg-red-50 dark:bg-red-950/20' : 'border-border hover:bg-muted/40',
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                                            checked ? 'bg-destructive border-destructive text-white' : 'border-input',
                                                        )}
                                                    >
                                                        {checked && <Check className="h-3 w-3" />}
                                                    </span>
                                                    <span className="font-mono">{s.serial}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSerialCheck(null)}>
                            {t('stock_count_back')}
                        </Button>
                        <Button disabled={!serialCheckOk || committing} onClick={() => runCommit(missingByItem)}>
                            {committing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            {t('stock_count_commit')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

type Kpi = { label: string; value: string | number; sub: string; icon: typeof Archive };

function DashboardTab({
    summary,
    t,
    kpis,
    onSelectWarehouse,
    onSelectCategory,
}: {
    summary: ReturnType<typeof useStockSummary>['data'];
    t: ReturnType<typeof useT>;
    kpis: Kpi[];
    onSelectWarehouse: (warehouse: string) => void;
    onSelectCategory: (category: string) => void;
}) {
    const { data: movements = [] } = useStockMovements();
    const maxUnits = Math.max(1, ...(summary?.by_category.map((c) => c.units) ?? []));
    // Items below their minimum, out-of-stock first, are the reorder queue.
    const reorderItems = summary ? [...summary.out_items, ...summary.low_items] : [];
    return (
        <div className="space-y-8">
            {/* KPI cards live on the Dashboard tab. */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {kpis.map((k) => {
                    const Icon = k.icon;
                    return (
                        <Card key={k.label} className="p-5">
                            <div className="flex items-start justify-between">
                                <div className="text-muted-foreground text-sm">{k.label}</div>
                                <span className="text-brand bg-brand/10 flex h-9 w-9 items-center justify-center rounded-lg">
                                    <Icon className="h-[18px] w-[18px]" />
                                </span>
                            </div>
                            <div className="mt-2 font-mono text-3xl font-bold">
                                {summary ? k.value : <div className="bg-muted h-8 w-16 animate-pulse rounded" />}
                            </div>
                            <div className="text-muted-foreground mt-1 text-xs">{k.sub}</div>
                        </Card>
                    );
                })}
            </div>

            {!summary ? (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="border-border bg-muted/40 h-64 animate-pulse rounded-xl border" />
                    ))}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                        <style>{stockConsoleStyles}</style>

                        {/* Action queue — reorder card with left severity accents */}
                        <Card className="overflow-hidden p-0">
                            <div className="border-border flex items-center justify-between border-b px-5 py-3">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                    <span className="text-sm font-semibold">{t('stock_action_queue')}</span>
                                </div>
                                {reorderItems.length > 0 && (
                                    <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 font-mono text-[11px] font-bold">
                                        {reorderItems.length}
                                    </span>
                                )}
                            </div>
                            {reorderItems.length === 0 ? (
                                <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
                                    <Check className="h-6 w-6 text-emerald-500" />
                                    {t('stock_all_stocked')}
                                </div>
                            ) : (
                                <div className="divide-border/60 divide-y">
                                    {reorderItems.slice(0, 6).map((it, i) => {
                                        const out = it.current_stock === 0;
                                        return (
                                            <div
                                                key={it.id}
                                                className="sc-row hover:bg-accent/30 flex items-stretch gap-3 px-3 py-2.5 transition-colors"
                                                style={{ animationDelay: `${i * 40}ms` }}
                                            >
                                                <span className={cn('w-1 shrink-0 rounded-full', out ? 'bg-destructive sc-led' : 'bg-amber-500')} />
                                                <div className="min-w-0 flex-1 py-0.5">
                                                    <div className="truncate text-sm font-medium">{it.name}</div>
                                                    <div className="text-muted-foreground font-mono text-[11px]">
                                                        {it.sku} ·{' '}
                                                        {(it.balances ?? [])
                                                            .filter((b) => b.qty > 0)
                                                            .map((b) => b.warehouse)
                                                            .join(', ') || '—'}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <div className="text-muted-foreground font-mono text-[11px]">
                                                        {it.current_stock}/{it.min_stock}
                                                    </div>
                                                    <span className="mt-0.5 inline-flex items-center rounded-md bg-emerald-500/12 px-1.5 py-0.5 font-mono text-xs font-bold text-emerald-600">
                                                        +{Math.max(0, it.max_stock - it.current_stock)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>

                        {/* Recent movements — vertical timeline feed */}
                        <Card className="overflow-hidden p-0">
                            <div className="border-border flex items-center justify-between border-b px-5 py-3">
                                <div className="flex items-center gap-2.5">
                                    <span className="relative flex h-2 w-2">
                                        <span className="sc-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                    </span>
                                    <span className="text-sm font-semibold">{t('stock_recent_moves')}</span>
                                </div>
                                <span className="text-muted-foreground font-mono text-[10px] tracking-[0.2em] uppercase">live</span>
                            </div>
                            {movements.length === 0 ? (
                                <div className="text-muted-foreground py-12 text-center text-sm">{t('stock_no_moves')}</div>
                            ) : (
                                <div className="p-1.5">
                                    {movements.slice(0, 6).map((m, i) => {
                                        const meta = MV_META[m.type];
                                        const MIcon = meta.icon;
                                        const inbound = m.type === 'receive' || m.type === 'return' || m.type === 'adjust_up';
                                        return (
                                            <div
                                                key={m.id}
                                                className="sc-row hover:bg-accent/40 flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                                                style={{ animationDelay: `${i * 40}ms` }}
                                            >
                                                <span
                                                    className={cn(
                                                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                                                        MV_TONE_BG[meta.tone],
                                                    )}
                                                >
                                                    <MIcon className="h-4 w-4" />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium">{m.item_name}</div>
                                                    <div className="text-muted-foreground font-mono text-[11px]">
                                                        {m.sku} · {t(`stock_mv_${m.type}` as Parameters<typeof t>[0])}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <div
                                                        className={cn(
                                                            'font-mono text-sm font-bold',
                                                            inbound ? 'text-emerald-600' : 'text-destructive',
                                                        )}
                                                    >
                                                        {inbound ? '+' : '−'}
                                                        {m.qty}
                                                    </div>
                                                    <div className="text-muted-foreground font-mono text-[10px]">{m.moved_at?.slice(5, 16)}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                        {/* By warehouse */}
                        <Card className="overflow-hidden p-0">
                            <div className="border-border flex items-center gap-2 border-b px-5 py-3">
                                <Warehouse className="text-brand h-4 w-4" />
                                <span className="text-sm font-semibold">{t('stock_by_warehouse')}</span>
                            </div>
                            <div className="divide-border/60 divide-y">
                                {summary.by_warehouse.map((w, i) => (
                                    <button
                                        type="button"
                                        key={w.warehouse}
                                        onClick={() => onSelectWarehouse(w.warehouse)}
                                        title={t('stock_view_items')}
                                        className="sc-row hover:bg-accent/30 group flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors"
                                        style={{ animationDelay: `${i * 40}ms` }}
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <span className="bg-brand/10 text-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                                                <Warehouse className="h-3.5 w-3.5" />
                                            </span>
                                            <span className="group-hover:text-brand truncate text-sm font-medium transition-colors">
                                                {w.warehouse}
                                            </span>
                                        </div>
                                        <div className="flex shrink-0 gap-5 text-right font-mono text-sm">
                                            <div>
                                                <div className="text-muted-foreground text-[10px] uppercase">SKU</div>
                                                {w.skus}
                                            </div>
                                            <div>
                                                <div className="text-muted-foreground text-[10px] uppercase">{t('stock_units')}</div>
                                                {w.units}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </Card>

                        {/* By category */}
                        <Card className="overflow-hidden p-0">
                            <div className="border-border flex items-center gap-2 border-b px-5 py-3">
                                <Layers className="text-brand h-4 w-4" />
                                <span className="text-sm font-semibold">{t('stock_by_category')}</span>
                            </div>
                            <div className="space-y-3.5 p-4">
                                {summary.by_category.map((c, i) => (
                                    <button
                                        type="button"
                                        key={c.category}
                                        onClick={() => onSelectCategory(c.category)}
                                        title={t('stock_view_items')}
                                        className="sc-row group block w-full text-left"
                                        style={{ animationDelay: `${i * 40}ms` }}
                                    >
                                        <div className="mb-1.5 flex items-center justify-between text-sm">
                                            <span className="group-hover:text-brand font-medium transition-colors">{c.category}</span>
                                            <span className="text-muted-foreground font-mono text-xs">{c.units}</span>
                                        </div>
                                        <div className="bg-muted h-2 overflow-hidden rounded-full">
                                            <span
                                                className="bg-brand block h-full rounded-full transition-all"
                                                style={{ width: `${(c.units / maxUnits) * 100}%` }}
                                            />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
