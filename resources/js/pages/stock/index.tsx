import { Column, DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { MovementDrawer } from '@/components/stock/movement-drawer';
import { RequestDrawer } from '@/components/stock/request-drawer';
import { StockItemModal } from '@/components/stock/stock-item-modal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useCategories, useWarehouses } from '@/hooks/use-master-data';
import { useCurrency } from '@/hooks/use-settings';
import {
    useStockCount,
    useStockCountMutations,
    useStockCounts,
    useStockItems,
    useStockMovements,
    useStockRequestActions,
    useStockRequests,
    useStockSummary,
} from '@/hooks/use-stock';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Role, StockItem, StockItemStatus, StockMovementType, StockRequestStatus } from '@/types';
import {
    AlertTriangle,
    Archive,
    ArrowDownToLine,
    ArrowLeftRight,
    ArrowUpFromLine,
    Boxes,
    Check,
    Pencil,
    Plus,
    RotateCcw,
    Search,
    Send,
    X,
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

/** Visual Min/Max bar — current marker against the healthy min..max band. */
function StockBar({ item }: { item: StockItem }) {
    const scaleMax = Math.max(item.max_stock * 1.4, item.current_stock + 1);
    const minPct = (item.min_stock / scaleMax) * 100;
    const maxPct = (item.max_stock / scaleMax) * 100;
    const curPct = Math.min(100, (item.current_stock / scaleMax) * 100);
    const fill =
        item.status === 'out' || item.status === 'low'
            ? 'bg-destructive'
            : item.status === 'over'
              ? 'bg-blue-500'
              : item.status === 'dead'
                ? 'bg-muted-foreground'
                : 'bg-emerald-500';
    return (
        <div className="flex items-center gap-2.5">
            <div className="bg-muted relative h-1.5 flex-1 rounded-full">
                <div
                    className="absolute inset-y-0 rounded-full bg-emerald-500/20"
                    style={{ left: `${minPct}%`, width: `${Math.max(0, maxPct - minPct)}%` }}
                />
                <div className="absolute -inset-y-0.5 w-px bg-amber-500" style={{ left: `${minPct}%` }} />
                <div className="absolute -inset-y-0.5 w-px bg-blue-500" style={{ left: `${maxPct}%` }} />
                <div className={cn('absolute inset-y-0 left-0 rounded-full', fill)} style={{ width: `${curPct}%` }} />
            </div>
            <div className="w-[72px] text-right font-mono text-xs">
                <span className="font-bold">{item.current_stock}</span>
                <span className="text-muted-foreground">
                    {' '}
                    / {item.min_stock}–{item.max_stock}
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
    const [addOpen, setAddOpen] = useState(false);
    const [moveKind, setMoveKind] = useState<StockMovementType | null>(null);
    const [reqOpen, setReqOpen] = useState(false);

    const { data: summary } = useStockSummary();
    const { data: categories = [] } = useCategories();
    const { data: warehouses = [] } = useWarehouses();
    const { data: items = [] } = useStockItems({
        search,
        category: cat === 'all' ? undefined : cat,
        warehouse: wh === 'all' ? undefined : wh,
        status: statusFilter === 'all' ? undefined : statusFilter,
    });

    const { data: requests = [] } = useStockRequests();
    const pendingRequests = requests.filter((r) => r.status === 'pending').length;

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
        { key: 'warehouse', header: t('stock_warehouse'), render: (i) => <span className="text-sm">{i.warehouse ?? '—'}</span> },
        { key: 'bar', header: `${t('stock_stock')} (Min / Max)`, className: 'min-w-[220px]', render: (i) => <StockBar item={i} /> },
        {
            key: 'cost',
            header: t('stock_cost'),
            align: 'right',
            render: (i) => (
                <span className="font-mono text-xs">
                    {symbol}
                    {i.cost.toLocaleString()}
                </span>
            ),
        },
        { key: 'status', header: t('status'), render: (i) => statusBadge(i.status) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (i) =>
                canManage ? (
                    <button onClick={() => setEditItem(i)} className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                        <Pencil className="h-4 w-4" />
                    </button>
                ) : null,
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
        { id: 'movements' as const, label: t('stock_movements_tab') },
        { id: 'requests' as const, label: t('stock_requests_tab') },
        { id: 'audit' as const, label: t('stock_audit_tab') },
    ];

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
                    {can('receive') && (
                        <Button variant="outline" onClick={() => setMoveKind('receive')}>
                            <ArrowDownToLine className="h-4 w-4" />
                            {t('stock_mv_receive')}
                        </Button>
                    )}
                    {canManage && (
                        <Button onClick={() => setAddOpen(true)}>
                            <Plus className="h-4 w-4" />
                            {t('stock_new_item')}
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
                                <Select value={cat} onValueChange={setCat}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t('stock_all_categories')}</SelectItem>
                                        {categories.map((c) => (
                                            <SelectItem key={c.id} value={c.name}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={wh} onValueChange={setWh}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t('stock_all_warehouses')}</SelectItem>
                                        {warehouses.map((w) => (
                                            <SelectItem key={w.id} value={w.name}>
                                                {w.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-44">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t('stock_all_statuses')}</SelectItem>
                                        <SelectItem value="alerts">{t('stock_st_alerts')}</SelectItem>
                                        {(['ok', 'low', 'out', 'over', 'dead'] as StockItemStatus[]).map((s) => (
                                            <SelectItem key={s} value={s}>
                                                {t(`stock_st_${s}` as Parameters<typeof t>[0])}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {(search !== '' || cat !== 'all' || wh !== 'all' || statusFilter !== 'all') && (
                                    <a
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setSearch('');
                                            setCat('all');
                                            setWh('all');
                                            setStatusFilter('all');
                                        }}
                                        className="bg-brand/10 text-brand hover:bg-brand/20 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                                    >
                                        <X className="h-3 w-3" />
                                        Reset
                                    </a>
                                )}
                            </div>
                            <DataTable columns={columns} rows={items} rowKey={(i) => i.id} />
                        </div>
                    )}

                    {tab === 'movements' && <MovementsTab can={can} onNew={setMoveKind} />}
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

function MovementsTab({ can, onNew }: { can: (p: string) => boolean; onNew: (k: StockMovementType) => void }) {
    const t = useT();
    const [type, setType] = useState('all');
    const { data: movements = [] } = useStockMovements(type === 'all' ? undefined : type);

    const newButtons: { kind: StockMovementType; perm: string }[] = [
        { kind: 'receive', perm: 'receive' },
        { kind: 'issue', perm: 'fulfill' },
        { kind: 'return', perm: 'return' },
        { kind: 'transfer', perm: 'transfer' },
    ];

    const columns: Column<(typeof movements)[number]>[] = [
        { key: 'moved_at', header: t('audit_time'), render: (m) => <span className="font-mono text-xs">{m.moved_at?.slice(0, 16)}</span> },
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
                <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="w-44">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('stock_all_types')}</SelectItem>
                        {(['receive', 'issue', 'return', 'transfer'] as StockMovementType[]).map((k) => (
                            <SelectItem key={k} value={k}>
                                {t(`stock_mv_${k}` as Parameters<typeof t>[0])}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="ml-auto flex gap-1.5">
                    {newButtons
                        .filter((b) => can(b.perm))
                        .map((b) => {
                            const Icon = MV_META[b.kind].icon;
                            return (
                                <Button key={b.kind} variant="outline" size="sm" onClick={() => onNew(b.kind)}>
                                    <Icon className="h-3.5 w-3.5" />
                                    {t(`stock_mv_${b.kind}` as Parameters<typeof t>[0])}
                                </Button>
                            );
                        })}
                </div>
            </div>
            <DataTable columns={columns} rows={movements} rowKey={(m) => m.id} />
        </div>
    );
}

function RequestsTab({ can, onNew }: { can: (p: string) => boolean; onNew: () => void }) {
    const t = useT();
    const { data: requests = [] } = useStockRequests();
    const { approve, reject, fulfill } = useStockRequestActions();

    const onError = (e: unknown) => {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        Swal.fire({ icon: 'error', title: 'Error', text: msg ?? 'Something went wrong.' });
    };

    const columns: Column<(typeof requests)[number]>[] = [
        { key: 'id', header: '#', render: (r) => <span className="font-mono text-xs">{r.id}</span> },
        { key: 'requester', header: t('stock_requester'), render: (r) => <span className="text-sm font-medium">{r.requester_name}</span> },
        { key: 'dept', header: t('department'), render: (r) => <span className="text-sm">{r.dept || '—'}</span> },
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
                            <Button size="sm" variant="outline" onClick={() => approve.mutate(r.id, { onError })}>
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                                {t('stock_approve')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => reject.mutate(r.id, { onError })}>
                                <X className="text-destructive h-3.5 w-3.5" />
                            </Button>
                        </>
                    )}
                    {can('fulfill') && r.status === 'approved' && (
                        <Button size="sm" onClick={() => fulfill.mutate(r.id, { onError })}>
                            <ArrowUpFromLine className="h-3.5 w-3.5" />
                            {t('stock_fulfill')}
                        </Button>
                    )}
                    {(r.status === 'fulfilled' || r.status === 'rejected') && <span className="text-muted-foreground text-xs">—</span>}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-end">
                {can('request') && (
                    <Button onClick={onNew}>
                        <Plus className="h-4 w-4" />
                        {t('stock_new_request')}
                    </Button>
                )}
            </div>
            <DataTable columns={columns} rows={requests} rowKey={(r) => r.id} />
        </div>
    );
}

/** Stock Count / Audit: open a session, enter physical counts, commit adjustments. */
function AuditTab({ can }: { can: (p: string) => boolean }) {
    const t = useT();
    const { data: sessions = [] } = useStockCounts(can('audit'));
    const { open, save, commit } = useStockCountMutations();
    const { data: warehouses = [] } = useWarehouses();
    const { data: categories = [] } = useCategories();
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const { data: session } = useStockCount(selectedId);
    const [creating, setCreating] = useState(false);
    const [wh, setWh] = useState('all');
    const [cat, setCat] = useState('all');
    const [entries, setEntries] = useState<Record<number, string>>({});

    const onError = (e: unknown) => {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        Swal.fire({ icon: 'error', title: 'Error', text: msg ?? 'Something went wrong.' });
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

    const start = async () => {
        try {
            const created = await open.mutateAsync({ warehouse: wh === 'all' ? null : wh, category: cat === 'all' ? null : cat });
            setSelectedId(created.id);
        } catch (e) {
            onError(e);
        } finally {
            setCreating(false);
            setWh('all');
            setCat('all');
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

    // ── Count sheet (a session is open) ──────────────────────────
    if (session) {
        const isDraft = session.status === 'draft';
        const anyCounted = Object.values(entries).some((v) => v.trim() !== '');
        return (
            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>
                        {t('stock_count_back')}
                    </Button>
                    <span className="font-mono text-sm font-semibold">{session.reference}</span>
                    <StatusBadge tone={statusTone(session.status)}>{t(`stock_count_${session.status}` as Parameters<typeof t>[0])}</StatusBadge>
                    {session.warehouse && <span className="text-muted-foreground text-xs">{session.warehouse}</span>}
                    {isDraft && can('audit') && (
                        <div className="ml-auto flex gap-1.5">
                            <Button variant="outline" size="sm" onClick={() => save.mutate({ id: session.id, counts: countsPayload() }, { onError })}>
                                {t('stock_count_save')}
                            </Button>
                            <Button size="sm" disabled={!anyCounted || commit.isPending} onClick={() => commit.mutate(session.id, { onError })}>
                                <Check className="h-3.5 w-3.5" />
                                {t('stock_count_commit')}
                            </Button>
                        </div>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                <th className="px-3 py-2">{t('stock_item')}</th>
                                <th className="px-3 py-2 text-right">{t('stock_count_system')}</th>
                                <th className="px-3 py-2 text-right">{t('stock_count_counted')}</th>
                                <th className="px-3 py-2 text-right">{t('stock_count_variance')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(session.lines ?? []).map((l) => {
                                const entered = entries[l.id] ?? '';
                                const variance = isDraft ? (entered.trim() === '' ? null : (parseInt(entered, 10) || 0) - l.system_qty) : l.variance;
                                return (
                                    <tr key={l.id} className="border-border/60 border-b last:border-0">
                                        <td className="px-3 py-2">
                                            <div className="font-mono text-xs">{l.sku}</div>
                                            <div className="text-muted-foreground truncate text-xs">{l.name}</div>
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono">{l.system_qty}</td>
                                        <td className="px-3 py-2 text-right">
                                            {isDraft ? (
                                                <Input
                                                    inputMode="numeric"
                                                    value={entered}
                                                    onChange={(e) => setEntries((p) => ({ ...p, [l.id]: e.target.value.replace(/[^\d]/g, '') }))}
                                                    className="ml-auto h-8 w-20 text-right font-mono"
                                                />
                                            ) : (
                                                <span className="font-mono">{l.counted_qty ?? '—'}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {variance === null ? (
                                                <span className="text-muted-foreground">—</span>
                                            ) : (
                                                <span
                                                    className={cn(
                                                        'font-mono font-semibold',
                                                        variance > 0
                                                            ? 'text-emerald-600'
                                                            : variance < 0
                                                              ? 'text-destructive'
                                                              : 'text-muted-foreground',
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
            </div>
        );
    }

    // ── Session list + create form ───────────────────────────────
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-muted-foreground text-sm">{t('stock_audit_tab')}</div>
                {can('audit') && !creating && (
                    <Button onClick={() => setCreating(true)}>
                        <Plus className="h-4 w-4" />
                        {t('stock_new_count')}
                    </Button>
                )}
            </div>

            {creating && (
                <Card className="flex flex-wrap items-end gap-3 p-4">
                    <Select value={wh} onValueChange={setWh}>
                        <SelectTrigger className="w-48">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('stock_count_all_wh')}</SelectItem>
                            {warehouses.map((w) => (
                                <SelectItem key={w.id} value={w.name}>
                                    {w.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={cat} onValueChange={setCat}>
                        <SelectTrigger className="w-48">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('stock_count_all_cat')}</SelectItem>
                            {categories.map((c) => (
                                <SelectItem key={c.id} value={c.name}>
                                    {c.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={start} disabled={open.isPending}>
                        {t('stock_count_start')}
                    </Button>
                    <Button variant="outline" onClick={() => setCreating(false)}>
                        {t('cancel')}
                    </Button>
                </Card>
            )}

            {sessions.length === 0 ? (
                <div className="text-muted-foreground py-12 text-center text-sm">{t('stock_count_none')}</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                <th className="px-3 py-2">{t('stock_count_ref')}</th>
                                <th className="px-3 py-2">{t('stock_warehouse')}</th>
                                <th className="px-3 py-2">{t('status')}</th>
                                <th className="px-3 py-2 text-right">{t('stock_count_progress')}</th>
                                <th className="px-3 py-2">{t('audit_time')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessions.map((s) => (
                                <tr
                                    key={s.id}
                                    className="border-border/60 hover:bg-accent/40 cursor-pointer border-b last:border-0"
                                    onClick={() => setSelectedId(s.id)}
                                >
                                    <td className="px-3 py-2 font-mono text-xs font-semibold">{s.reference}</td>
                                    <td className="px-3 py-2">{s.warehouse || '—'}</td>
                                    <td className="px-3 py-2">
                                        <StatusBadge tone={statusTone(s.status)}>
                                            {t(`stock_count_${s.status}` as Parameters<typeof t>[0])}
                                        </StatusBadge>
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-xs">
                                        {s.counted_lines ?? 0}/{s.line_count ?? 0} {t('stock_count_progress')}
                                    </td>
                                    <td className="text-muted-foreground px-3 py-2 font-mono text-xs">{s.created_at?.slice(0, 10)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
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
    const { symbol } = useCurrency();
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
                            <div className="mt-2 font-mono text-3xl font-bold">{k.value}</div>
                            <div className="text-muted-foreground mt-1 text-xs">{k.sub}</div>
                        </Card>
                    );
                })}
            </div>

            {!summary ? (
                <div className="text-muted-foreground py-10 text-center text-sm">—</div>
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
                                                        {it.sku} · {it.warehouse || '—'}
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 flex-col items-end justify-center">
                                                    <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/12 px-2 py-0.5 font-mono text-xs font-bold text-emerald-600">
                                                        <ArrowUpFromLine className="h-3 w-3" />
                                                        {Math.max(0, it.max_stock - it.current_stock)}
                                                    </span>
                                                    <span className="text-muted-foreground mt-0.5 font-mono text-[10px]">
                                                        {it.current_stock}/{it.min_stock}
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
                                <div className="relative px-5 py-4">
                                    <span className="bg-border absolute top-5 bottom-5 left-[27px] w-px" />
                                    <div className="space-y-3.5">
                                        {movements.slice(0, 6).map((m, i) => {
                                            const meta = MV_META[m.type];
                                            const MIcon = meta.icon;
                                            const inbound = m.type === 'receive' || m.type === 'return' || m.type === 'adjust_up';
                                            return (
                                                <div key={m.id} className="sc-row flex items-center gap-3" style={{ animationDelay: `${i * 40}ms` }}>
                                                    <span
                                                        className={cn(
                                                            'ring-card relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-4',
                                                            MV_TONE_BG[meta.tone],
                                                        )}
                                                    >
                                                        <MIcon className="h-3 w-3" />
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
                                </div>
                            )}
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                        <div>
                            <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{t('stock_by_warehouse')}</div>
                            <div className="space-y-2">
                                {summary.by_warehouse.map((w) => (
                                    <button
                                        type="button"
                                        key={w.warehouse}
                                        onClick={() => onSelectWarehouse(w.warehouse)}
                                        title={t('stock_view_items')}
                                        className="border-border hover:bg-accent/50 hover:border-brand/40 flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left transition-colors"
                                    >
                                        <div className="text-sm font-medium">{w.warehouse}</div>
                                        <div className="flex gap-6 text-right font-mono text-sm">
                                            <div>
                                                <div className="text-muted-foreground text-[10px] uppercase">SKU</div>
                                                {w.skus}
                                            </div>
                                            <div>
                                                <div className="text-muted-foreground text-[10px] uppercase">{t('stock_units')}</div>
                                                {w.units}
                                            </div>
                                            <div>
                                                <div className="text-muted-foreground text-[10px] uppercase">{t('stock_value')}</div>
                                                {symbol}
                                                {(w.value / 1000).toFixed(0)}K
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{t('stock_by_category')}</div>
                            <div className="space-y-2.5">
                                {summary.by_category.map((c) => (
                                    <button
                                        type="button"
                                        key={c.category}
                                        onClick={() => onSelectCategory(c.category)}
                                        title={t('stock_view_items')}
                                        className="group block w-full text-left"
                                    >
                                        <div className="mb-1 flex justify-between text-sm">
                                            <span className="group-hover:text-brand transition-colors">{c.category}</span>
                                            <span className="text-muted-foreground font-mono">{c.units}</span>
                                        </div>
                                        <div className="bg-muted h-1.5 rounded-full">
                                            <span
                                                className="bg-brand block h-full rounded-full"
                                                style={{ width: `${(c.units / maxUnits) * 100}%` }}
                                            />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
