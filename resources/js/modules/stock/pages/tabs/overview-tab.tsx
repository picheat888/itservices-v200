import { useT } from '@/lang';
import { OverviewHeader } from '@/shared/components/overview-period';
import { StatCard } from '@/shared/components/stat-card';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { CARD_HEADING } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { AlertTriangle, Archive, Check, ChevronRight, Layers, Warehouse } from 'lucide-react';
import { useStockSummary } from '../../hooks/use-stock';
import { MV_META, MV_TONE_BG } from '../shared';

export type Kpi = { label: string; value: string | number; sub: string; icon: typeof Archive; onClick?: () => void };

/** Reorder rows listed before the rest fold behind "view all". */
const REORDER_SHOWN = 6;

const PANEL = 'flex h-auto max-h-[22rem] flex-col overflow-hidden p-0 lg:h-[22rem]';
const PANEL_LIST = 'divide-border/60 min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain p-2';
const PANEL_TITLE = 'text-sm font-semibold';

export function OverviewTab({
    summary,
    t,
    kpis,
    onSelectWarehouse,
    onSelectCategory,
    onViewAlerts,
    canEvents,
}: {
    summary: ReturnType<typeof useStockSummary>['data'];
    t: ReturnType<typeof useT>;
    kpis: Kpi[];
    onSelectWarehouse: (warehouse: string) => void;
    onSelectCategory: (category: string) => void;
    /** Opens the Items tab filtered to the alert statuses. */
    onViewAlerts: () => void;
    /** When false the recent-movements card is hidden (caller lacks stock.view_events). */
    canEvents: boolean;
}) {
    const fmt = useDateFormat();
    // Recent movements ride along in the summary payload; empty for users without view_events.
    const movements = summary?.recent_movements ?? [];
    const maxUnits = Math.max(1, ...(summary?.by_category.map((c) => c.units) ?? []));
    // Items below their minimum, out-of-stock first, are the reorder queue.
    const reorderItems = summary ? [...summary.out_items, ...summary.low_items] : [];
    return (
        <div className="space-y-8">
            <OverviewHeader />
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {kpis.map((k) => (
                    <StatCard
                        key={k.label}
                        icon={k.icon}
                        label={k.label}
                        value={String(k.value)}
                        sub={k.sub}
                        onClick={k.onClick}
                        loading={!summary}
                    />
                ))}
            </div>

            {!summary ? (
                // Skeleton mirrors the real card grid (header + rows).
                <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
                    {Array.from({ length: canEvents ? 4 : 3 }).map((_, i) => (
                        <Card key={i} className={PANEL}>
                            <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2 border-b px-5 py-3')}>
                                <div className="bg-muted h-4 w-4 animate-pulse rounded" />
                                <div className="bg-muted h-4 w-36 animate-pulse rounded" />
                            </div>
                            <div className="min-h-0 flex-1 space-y-3 p-4">
                                {Array.from({ length: 5 }).map((_, r) => (
                                    <div key={r} className="flex items-center gap-3">
                                        <div className="bg-muted h-8 w-8 shrink-0 animate-pulse rounded-lg" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="bg-muted h-3.5 w-2/3 animate-pulse rounded" />
                                            <div className="bg-muted h-2.5 w-1/3 animate-pulse rounded" />
                                        </div>
                                        <div className="bg-muted h-4 w-8 shrink-0 animate-pulse rounded" />
                                    </div>
                                ))}
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                // One grid holds every panel so a hidden card lets the rest reflow up.
                <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
                    {/* Reorder queue */}
                    <Card className={PANEL}>
                        <div className={cn(CARD_HEADING, 'border-border flex items-center justify-between border-b px-5 py-3')}>
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400" aria-hidden />
                                <h2 className={PANEL_TITLE}>{t('stock_action_queue')}</h2>
                            </div>
                            {reorderItems.length > 0 && (
                                <span className="bg-destructive/10 dark:text-destructive rounded-full px-2 py-0.5 text-[11px] font-bold text-red-700 tabular-nums">
                                    {reorderItems.length}
                                </span>
                            )}
                        </div>
                        {reorderItems.length === 0 ? (
                            <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-sm">
                                <Check className="h-6 w-6 text-emerald-500 dark:text-emerald-400" aria-hidden />
                                {t('stock_all_stocked')}
                            </div>
                        ) : (
                            <>
                                <div className={PANEL_LIST}>
                                    {reorderItems.slice(0, REORDER_SHOWN).map((it) => {
                                        const out = it.current_stock === 0;
                                        return (
                                            <div key={it.id} className="hover:bg-accent/30 flex items-stretch gap-3 px-3 py-2.5 transition-colors">
                                                <span
                                                    className={cn(
                                                        'w-1 shrink-0 rounded-full',
                                                        out ? 'bg-destructive ring-destructive/20 ring-[3px]' : 'bg-amber-500',
                                                    )}
                                                    aria-hidden
                                                />
                                                <div className="min-w-0 flex-1 py-0.5">
                                                    <div className="truncate text-sm font-medium">
                                                        <span className="sr-only">{t(out ? 'stock_st_out' : 'stock_st_low')} </span>
                                                        {it.name}
                                                    </div>
                                                    <div className="text-muted-foreground flex flex-wrap gap-x-3 text-[11px]">
                                                        <span>{it.sku}</span>
                                                        <span>
                                                            {(it.balances ?? [])
                                                                .filter((b) => b.qty > 0)
                                                                .map((b) => b.warehouse)
                                                                .join(', ') || '—'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <div className="text-muted-foreground text-[11px] tabular-nums">
                                                        {it.current_stock}/{it.min_stock}
                                                    </div>
                                                    <span className="mt-0.5 inline-flex items-center rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-xs font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                                                        <span className="sr-only">{t('stock_reorder_qty')} </span>+
                                                        {Math.max(0, it.max_stock - it.current_stock)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {reorderItems.length > REORDER_SHOWN && (
                                    <button
                                        type="button"
                                        onClick={onViewAlerts}
                                        className="border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring mt-auto flex w-full shrink-0 items-center justify-center gap-1.5 border-t py-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                                    >
                                        {t('stock_show_all_alerts').replace('{n}', String(reorderItems.length))}
                                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                )}
                            </>
                        )}
                    </Card>

                    {/* Recent movements (stock.view_events only) */}
                    {canEvents && (
                        <Card className={PANEL}>
                            <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2.5 border-b px-5 py-3')}>
                                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                                <h2 className={PANEL_TITLE}>{t('stock_recent_moves')}</h2>
                            </div>
                            {movements.length === 0 ? (
                                <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center py-12 text-center text-sm">
                                    {t('stock_no_moves')}
                                </div>
                            ) : (
                                <div className={PANEL_LIST}>
                                    {movements.slice(0, 6).map((m) => {
                                        const meta = MV_META[m.type];
                                        const MIcon = meta.icon;
                                        return (
                                            <div key={m.id} className="hover:bg-accent/40 flex items-center gap-3 px-3 py-2.5 transition-colors">
                                                <span
                                                    className={cn(
                                                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                                                        MV_TONE_BG[meta.tone],
                                                    )}
                                                    aria-hidden
                                                >
                                                    <MIcon className="h-4 w-4" />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium">{m.item_name}</div>
                                                    <div className="text-muted-foreground flex flex-wrap gap-x-3 text-[11px]">
                                                        <span>{m.sku}</span>
                                                        <span>{t(`stock_mv_${m.type}` as Parameters<typeof t>[0])}</span>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <div
                                                        className={cn(
                                                            'text-sm font-bold tabular-nums',
                                                            meta.sign > 0
                                                                ? 'text-emerald-700 dark:text-emerald-400'
                                                                : meta.sign < 0
                                                                  ? 'text-destructive'
                                                                  : '',
                                                        )}
                                                    >
                                                        {meta.sign > 0 ? '+' : meta.sign < 0 ? '−' : ''}
                                                        {m.qty}
                                                    </div>
                                                    <div className="text-muted-foreground text-[10px] whitespace-nowrap">
                                                        <span className="lg:hidden">{fmt.date(m.moved_at)}</span>
                                                        <span className="hidden lg:inline">{fmt.dateTime(m.moved_at)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Card>
                    )}

                    {/* By warehouse */}
                    <Card className={PANEL}>
                        <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2 border-b px-5 py-3')}>
                            <Warehouse className="text-muted-foreground h-4 w-4" aria-hidden />
                            <h2 className={PANEL_TITLE}>{t('stock_by_warehouse')}</h2>
                        </div>
                        <div className={PANEL_LIST}>
                            {summary.by_warehouse.map((w) => (
                                <button
                                    type="button"
                                    key={w.warehouse}
                                    onClick={() => onSelectWarehouse(w.warehouse)}
                                    title={t('stock_view_items')}
                                    className="hover:bg-accent/30 group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors"
                                >
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <span
                                            className="bg-brand/10 text-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                                            aria-hidden
                                        >
                                            <Warehouse className="h-3.5 w-3.5" />
                                        </span>
                                        <span className="group-hover:text-brand truncate text-sm font-medium transition-colors">{w.warehouse}</span>
                                    </div>
                                    <div className="flex shrink-0 gap-4 text-right text-sm tabular-nums">
                                        <div className="w-12">
                                            <div className="text-muted-foreground text-[10px] uppercase">SKU</div>
                                            {w.skus}
                                        </div>
                                        <div className="w-14">
                                            <div className="text-muted-foreground text-[10px] uppercase">{t('stock_units')}</div>
                                            {w.units}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </Card>

                    {/* By category */}
                    <Card className={PANEL}>
                        <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2 border-b px-5 py-3')}>
                            <Layers className="text-muted-foreground h-4 w-4" aria-hidden />
                            <h2 className={PANEL_TITLE}>{t('stock_by_category')}</h2>
                        </div>
                        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain p-4">
                            {summary.by_category.map((c) => (
                                <button
                                    type="button"
                                    key={c.category}
                                    onClick={() => onSelectCategory(c.category)}
                                    title={t('stock_view_items')}
                                    className="group block w-full text-left"
                                >
                                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                                        <span className="group-hover:text-brand min-w-0 truncate font-medium transition-colors">{c.category}</span>
                                        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{c.units}</span>
                                    </div>
                                    <div className="bg-muted h-2 overflow-hidden rounded-full">
                                        <span
                                            className="bg-brand block h-full rounded-full transition-[width]"
                                            style={{ width: `${(c.units / maxUnits) * 100}%` }}
                                        />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
