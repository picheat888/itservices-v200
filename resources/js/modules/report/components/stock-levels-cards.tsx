// Below min & overstock report cards: tiles, the rows legend with counts, and items by category (data: useStockLevelsBreakdown).
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { localPair } from '@/shared/lib/local-name';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUiStore } from '@/stores/ui';
import { useState } from 'react';
import { useStockLevelsBreakdown } from '../hooks/use-reports';
import type { ChartTone, StockLevelsBreakdown, TabularFilters } from '../types';
import { CardsUpdating } from './cards-updating';
import { CardEmpty, CardPager, CardTitle, CountBar, InfoMark, Swatch } from './chart-parts';
import { FILL } from './chart-tones';
import { KpiTile } from './kpi-tile';
import { BarRowsSkeleton, CardHeadingSkeleton, KpiRowSkeleton } from './report-skeletons';
import { sharePercent, shownPieces, splitBar, stockCount, stockMoney, TileFoot, TileLegend } from './stock-parts';
import { summaryColumns } from './summary-strip';
import { ErrorCard, errorMessageFor } from './tabular-report-view';

type Tiles = StockLevelsBreakdown['tiles'];
type Level = 'out' | 'low' | 'over';

/** Category rows the card shows on one page. */
const PAGE_SIZE = 10;

/** The three levels in page order, each in its stock module tone. */
const LEVELS: { key: Level; tone: ChartTone }[] = [
    { key: 'out', tone: 'red' },
    { key: 'low', tone: 'amber' },
    { key: 'over', tone: 'blue' },
];

/* ─────────────────────────── tiles ─────────────────────────── */

function LevelTiles({ tiles }: { tiles: Tiles }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const n = (v: number) => stockCount(v, lang);
    const unit = t('rep_slv_unit');
    const foot = (template: string, bold: Record<string, string>) => <TileFoot template={template} bold={bold} />;
    const share = (count: number) => `${sharePercent(count, tiles.items_total)}%`;
    const ok = Math.max(0, tiles.items_total - tiles.out - tiles.low - tiles.over);
    const pieces = shownPieces([
        { key: 'ok', label: t('stock_st_ok'), fill: FILL.green, value: ok, text: n(ok) },
        { key: 'low', label: t('stock_st_low'), fill: FILL.amber, value: tiles.low, text: n(tiles.low) },
        { key: 'out', label: t('rep_slv_k_out_short'), fill: FILL.red, value: tiles.out, text: n(tiles.out) },
        { key: 'over', label: t('stock_st_over'), fill: FILL.blue, value: tiles.over, text: n(tiles.over) },
    ]);

    return (
        <div className={cn('grid grid-cols-2 gap-3', summaryColumns(5))}>
            <KpiTile
                label={t('stock_st_out')}
                value={n(tiles.out)}
                unit={unit}
                tone={tiles.out > 0 ? 'red' : undefined}
                alert={tiles.out > 0 ? 'red' : undefined}
                badge={tiles.out > 0 ? <StatusBadge tone="red">{share(tiles.out)}</StatusBadge> : undefined}
                bar={pieces.length > 0 ? splitBar(pieces) : undefined}
                footer={pieces.length > 0 ? <TileLegend pieces={pieces} /> : undefined}
            />
            <KpiTile
                label={t('stock_st_low')}
                value={n(tiles.low)}
                unit={unit}
                tone={tiles.low > 0 ? 'amber' : undefined}
                alert={tiles.low > 0 ? 'amber' : undefined}
                badge={tiles.low > 0 ? <StatusBadge tone="amber">{share(tiles.low)}</StatusBadge> : undefined}
                footer={foot('rep_slv_k_low_foot', { n: n(tiles.low_gap) })}
            />
            <KpiTile
                label={t('stock_st_over')}
                value={n(tiles.over)}
                unit={unit}
                tone={tiles.over > 0 ? 'blue' : undefined}
                badge={tiles.over > 0 ? <StatusBadge tone="blue">{share(tiles.over)}</StatusBadge> : undefined}
                footer={foot('rep_slv_k_over_foot', { n: n(tiles.over_excess) })}
            />
            <KpiTile
                label={t('rep_slv_k_reorder')}
                badge={<InfoMark info={[t('rep_slv_k_reorder_info_qty'), t('rep_slv_k_reorder_info_none')]} />}
                value={stockMoney(tiles.reorder.value, lang)}
                footer={foot('rep_slv_k_reorder_foot', { n: n(tiles.reorder.items) })}
            />
            <KpiTile label={t('rep_slv_k_excess')} value={stockMoney(tiles.excess_value, lang)} footer={foot('rep_slv_k_excess_foot', {})} />
        </div>
    );
}

export function StockLevelsTiles({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const { data, isLoading, isFetching, isError, error } = useStockLevelsBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <KpiRowSkeleton count={5} className={summaryColumns(5)} />;
    return (
        <CardsUpdating updating={isFetching && !isLoading}>
            <LevelTiles tiles={data.tiles} />
        </CardsUpdating>
    );
}

/* ─────────────────────────── rows legend ─────────────────────────── */

/** "หมดสต็อก 3 ต่ำกว่า Min 5 เกิน Max 2" beside the rows card's title. */
export function StockLevelsLegend({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data } = useStockLevelsBreakdown(filters);
    if (!data) {
        return (
            <span aria-hidden className="flex items-center gap-3">
                {LEVELS.map((l) => (
                    <Skeleton key={l.key} className="h-3.5 w-20" />
                ))}
            </span>
        );
    }

    return (
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {LEVELS.map((l) => (
                <Swatch key={l.key} fill={FILL[l.tone]}>
                    {t(`stock_st_${l.key}`)}
                    <b className="text-foreground font-semibold tabular-nums">{stockCount(data.tiles[l.key], lang)}</b>
                </Swatch>
            ))}
        </span>
    );
}

/* ─────────────────────────── by category ─────────────────────────── */

interface CategoryRow {
    key: string;
    name: string;
    counts: Record<Level, number>;
    total: number;
}

/** One category: its name, the out / low / over counts inside a bar on a shared scale (tap for the split), and the total. */
function CategoryLine({ row, scale }: { row: CategoryRow; scale: number }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    return (
        <li className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)_3.5rem]">
            <span className="truncate" title={row.name}>
                {row.name}
            </span>
            <CountBar
                pieces={LEVELS.map((l) => ({ key: l.key, label: t(`stock_st_${l.key}`), tone: l.tone, value: row.counts[l.key] }))}
                scale={scale}
            />
            <b className="text-right text-[13px] font-semibold tabular-nums">{stockCount(row.total, lang)}</b>
        </li>
    );
}

function CategoryCard({ categories }: { categories: StockLevelsBreakdown['categories'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [page, setPage] = useState(1);
    const rows: CategoryRow[] = categories.map((c) => ({
        key: String(c.category_id ?? 'none'),
        name: localPair(c.name, c.name_th, lang) ?? t('rep_wo_no_category'),
        counts: { out: c.out, low: c.low, over: c.over },
        total: c.out + c.low + c.over,
    }));
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const current = Math.min(page, pages);
    const scale = rows[0]?.total || 1;
    const legend = (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {LEVELS.map((l) => (
                <Swatch key={l.key} fill={FILL[l.tone]}>
                    {t(`stock_st_${l.key}`)}
                </Swatch>
            ))}
        </span>
    );

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle title={t('rep_slv_cat_title')} sub={legend} />
            {rows.length === 0 ? (
                <CardEmpty kind="clear" title={t('rep_empty_below_min_categories')} hint={t('rep_empty_below_min_categories_hint')} />
            ) : (
                <>
                    <ul className="space-y-2.5 px-5 py-4">
                        {rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map((r) => (
                            <CategoryLine key={r.key} row={r} scale={scale} />
                        ))}
                    </ul>
                    <CardPager page={current} total={rows.length} pageSize={PAGE_SIZE} onPage={setPage} />
                </>
            )}
        </Card>
    );
}

export function StockLevelsCategoryCard({ filters }: { filters: TabularFilters }) {
    const { data, isLoading, isFetching, isError } = useStockLevelsBreakdown(filters);

    // The tiles above already say when the breakdown failed.
    if (isError) return null;

    return (
        // Half width; full width on a tablet (iPad mini 768px).
        <div className="grid items-start gap-3 lg:grid-cols-2">
            {isLoading || !data ? (
                <Card className="overflow-hidden" aria-hidden>
                    <CardHeadingSkeleton note={false} />
                    <BarRowsSkeleton rows={5} />
                </Card>
            ) : (
                <CardsUpdating updating={isFetching && !isLoading}>
                    {/* A new category starts the card on page 1. */}
                    <CategoryCard key={String(filters.category_id ?? '')} categories={data.categories} />
                </CardsUpdating>
            )}
        </div>
    );
}
