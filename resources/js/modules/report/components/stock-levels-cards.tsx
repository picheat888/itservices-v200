// Below min & overstock report cards: tiles, the rows legend with counts, and items by category (data: useStockLevelsBreakdown).
import { useT } from '@/lang';
import { localPair } from '@/shared/lib/local-name';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useStockLevelsBreakdown } from '../hooks/use-reports';
import type { StockLevelsBreakdown, TabularFilters } from '../types';
import { CardEmpty, CardTitle, InfoMark, rich, Swatch } from './chart-parts';
import { FILL } from './chart-tones';
import { KpiTile } from './kpi-tile';
import { BarRowsSkeleton, CardHeadingSkeleton, KpiRowSkeleton } from './report-skeletons';
import { stockCount, stockMoney } from './stock-parts';
import { summaryColumns } from './summary-strip';
import { ErrorCard, errorMessageFor } from './tabular-report-view';

type Tiles = StockLevelsBreakdown['tiles'];
type Level = 'out' | 'low' | 'over';

/** Category rows the card shows on one page. */
const PAGE_SIZE = 10;

/** The three levels in page order, each in its stock module tone. */
const LEVELS: { key: Level; fill: string }[] = [
    { key: 'out', fill: FILL.red },
    { key: 'low', fill: FILL.amber },
    { key: 'over', fill: FILL.blue },
];

const TRACK = 'dark:bg-muted block h-3 overflow-hidden rounded-full bg-slate-200';
const PAGER_BUTTON =
    'border-border bg-background hover:bg-accent focus-visible:ring-ring flex h-7 w-7 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40';

/* ─────────────────────────── tiles ─────────────────────────── */

function LevelTiles({ tiles }: { tiles: Tiles }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const n = (v: number) => stockCount(v, lang);
    const unit = t('rep_slv_unit');
    const foot = (template: string, bold: Record<string, string>) => <span className="block truncate">{rich(t(template), bold)}</span>;

    return (
        <div className={cn('grid grid-cols-2 gap-3', summaryColumns(5))}>
            <KpiTile
                label={t('stock_st_out')}
                value={n(tiles.out)}
                unit={unit}
                alert={tiles.out > 0 ? 'red' : undefined}
                footer={foot('rep_slv_k_out_foot', { n: n(tiles.items_total) })}
            />
            <KpiTile
                label={t('stock_st_low')}
                value={n(tiles.low)}
                unit={unit}
                alert={tiles.low > 0 ? 'amber' : undefined}
                footer={foot('rep_slv_k_low_foot', { n: n(tiles.low_gap) })}
            />
            <KpiTile label={t('stock_st_over')} value={n(tiles.over)} unit={unit} footer={foot('rep_slv_k_over_foot', { n: n(tiles.over_excess) })} />
            <KpiTile
                label={t('rep_slv_k_reorder')}
                badge={<InfoMark info={[t('rep_slv_k_reorder_info_qty'), t('rep_slv_k_reorder_info_none')]} />}
                value={stockMoney(tiles.reorder.value, lang)}
                footer={foot('rep_slv_k_reorder_foot', { n: n(tiles.reorder.items) })}
            />
            <KpiTile
                label={t('rep_slv_k_excess')}
                value={stockMoney(tiles.excess_value, lang)}
                footer={<span className="block truncate">{t('rep_slv_k_excess_foot')}</span>}
            />
        </div>
    );
}

export function StockLevelsTiles({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const { data, isLoading, isError, error } = useStockLevelsBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <KpiRowSkeleton count={5} className={summaryColumns(5)} />;
    return <LevelTiles tiles={data.tiles} />;
}

/* ─────────────────────────── rows legend ─────────────────────────── */

/** "หมดสต็อก 3 ต่ำกว่า Min 5 เกิน Max 2" beside the rows card's title. */
export function StockLevelsLegend({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data } = useStockLevelsBreakdown(filters);
    if (!data) return null;

    return (
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {LEVELS.map((l) => (
                <Swatch key={l.key} fill={l.fill}>
                    {t(`stock_st_${l.key}`)}
                    <b className="text-foreground font-semibold tabular-nums">{stockCount(data.tiles[l.key], lang)}</b>
                </Swatch>
            ))}
        </span>
    );
}

/* ─────────────────────────── by category ─────────────────────────── */

/** "1–10 จาก 14 ‹ 1 / 2 ›" under the card; hidden at one page. */
function CardPager({ page, total, onPage }: { page: number; total: number; onPage: (next: number) => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const pages = Math.ceil(total / PAGE_SIZE);
    if (pages <= 1) return null;
    const range = t('rep_slv_pager')
        .replace('{from}', stockCount((page - 1) * PAGE_SIZE + 1, lang))
        .replace('{to}', stockCount(Math.min(page * PAGE_SIZE, total), lang))
        .replace('{total}', stockCount(total, lang));

    return (
        <div className="text-muted-foreground mt-auto flex items-center justify-end gap-2 px-4 pt-2 pb-3 text-xs">
            <span aria-live="polite" className="tabular-nums">
                {range}
            </span>
            <button type="button" aria-label={t('page_prev')} disabled={page <= 1} onClick={() => onPage(page - 1)} className={PAGER_BUTTON}>
                <ChevronLeft aria-hidden className="h-4 w-4" />
            </button>
            <b className="text-foreground font-semibold tabular-nums">
                {page} / {pages}
            </b>
            <button type="button" aria-label={t('page_next')} disabled={page >= pages} onClick={() => onPage(page + 1)} className={PAGER_BUTTON}>
                <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
        </div>
    );
}

interface CategoryRow {
    key: string;
    name: string;
    counts: Record<Level, number>;
    total: number;
}

/** One category: its name, the out / low / over pieces on a shared scale, and the total. */
function CategoryLine({ row, scale }: { row: CategoryRow; scale: number }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const label = LEVELS.map((l) => `${t(`stock_st_${l.key}`)} ${stockCount(row.counts[l.key], lang)}`).join(', ');

    return (
        <li className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)_3.5rem]">
            <span className="truncate" title={row.name}>
                {row.name}
            </span>
            <span role="img" aria-label={`${row.name}: ${label}`} className={TRACK}>
                <span className="flex h-full gap-px overflow-hidden rounded-full" style={{ width: `${Math.min(100, (row.total / scale) * 100)}%` }}>
                    {LEVELS.filter((l) => row.counts[l.key] > 0).map((l) => (
                        <i key={l.key} className={cn('block h-full min-w-[3px] basis-0', l.fill)} style={{ flexGrow: row.counts[l.key] }} />
                    ))}
                </span>
            </span>
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
        name: localPair(c.name, c.name_th, lang) ?? t('rep_slv_no_cat'),
        counts: { out: c.out, low: c.low, over: c.over },
        total: c.out + c.low + c.over,
    }));
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const current = Math.min(page, pages);
    const scale = rows[0]?.total || 1;
    const legend = (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {LEVELS.map((l) => (
                <Swatch key={l.key} fill={l.fill}>
                    {t(`stock_st_${l.key}`)}
                </Swatch>
            ))}
        </span>
    );

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle title={t('rep_slv_cat_title')} sub={legend} />
            {rows.length === 0 ? (
                <CardEmpty>{t('rep_slv_cat_empty')}</CardEmpty>
            ) : (
                <>
                    <ul className="space-y-2.5 px-5 py-4">
                        {rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map((r) => (
                            <CategoryLine key={r.key} row={r} scale={scale} />
                        ))}
                    </ul>
                    <CardPager page={current} total={rows.length} onPage={setPage} />
                </>
            )}
        </Card>
    );
}

export function StockLevelsCategoryCard({ filters }: { filters: TabularFilters }) {
    const { data, isLoading, isError } = useStockLevelsBreakdown(filters);

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
                // A new category starts the card on page 1.
                <CategoryCard key={String(filters.category_id ?? '')} categories={data.categories} />
            )}
        </div>
    );
}
