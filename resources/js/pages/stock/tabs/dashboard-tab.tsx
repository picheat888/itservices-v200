import { Card } from '@/components/ui/card';
import { useStockMovements, useStockSummary } from '@/hooks/use-stock';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { AlertTriangle, Archive, Check, Layers, Warehouse } from 'lucide-react';
import { MV_META, MV_TONE_BG } from '../shared';

export type Kpi = { label: string; value: string | number; sub: string; icon: typeof Archive };

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

export function DashboardTab({
    summary,
    t,
    kpis,
    onSelectWarehouse,
    onSelectCategory,
    canEvents,
}: {
    summary: ReturnType<typeof useStockSummary>['data'];
    t: ReturnType<typeof useT>;
    kpis: Kpi[];
    onSelectWarehouse: (warehouse: string) => void;
    onSelectCategory: (category: string) => void;
    /** When false the movements query is skipped and the recent-movements widget is hidden (caller lacks stock.view_events). */
    canEvents: boolean;
}) {
    // Only the most recent movements are shown here; one page is plenty.
    const { data: movementsPage } = useStockMovements({ per_page: 10 }, canEvents);
    const movements = movementsPage?.data ?? [];
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
                    <style>{stockConsoleStyles}</style>
                    {/* One grid holds every panel so a hidden card (e.g. Recent movements
                        when the user lacks view_events) lets the rest reflow up to fill it. */}
                    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                        {/* Action queue — reorder card with left severity accents */}
                        <Card className="flex h-[22rem] flex-col overflow-hidden p-0">
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
                                <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-sm">
                                    <Check className="h-6 w-6 text-emerald-500" />
                                    {t('stock_all_stocked')}
                                </div>
                            ) : (
                                <div className="divide-border/60 min-h-0 flex-1 divide-y overflow-y-auto">
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

                        {/* Recent movements — only shown when the user has stock.view_events */}
                        {canEvents && (
                            <Card className="flex h-[22rem] flex-col overflow-hidden p-0">
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
                                    <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center py-12 text-center text-sm">{t('stock_no_moves')}</div>
                                ) : (
                                    <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
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
                        )}

                        {/* By warehouse */}
                        <Card className="flex h-[22rem] flex-col overflow-hidden p-0">
                            <div className="border-border flex items-center gap-2 border-b px-5 py-3">
                                <Warehouse className="text-brand h-4 w-4" />
                                <span className="text-sm font-semibold">{t('stock_by_warehouse')}</span>
                            </div>
                            <div className="divide-border/60 min-h-0 flex-1 divide-y overflow-y-auto">
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
                        <Card className="flex h-[22rem] flex-col overflow-hidden p-0">
                            <div className="border-border flex items-center gap-2 border-b px-5 py-3">
                                <Layers className="text-brand h-4 w-4" />
                                <span className="text-sm font-semibold">{t('stock_by_category')}</span>
                            </div>
                            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4">
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
