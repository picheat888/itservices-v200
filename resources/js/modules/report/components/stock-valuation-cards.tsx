// Stock value report cards: tiles, value by category and by warehouse, dead stock (data: useStockValuationBreakdown).
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { localPair } from '@/shared/lib/local-name';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { useState } from 'react';
import { useStockValuationBreakdown } from '../hooks/use-reports';
import type { StockValuationBreakdown, TabularFilters } from '../types';
import { CardEmpty, CardPager, CardTitle, fold, FoldToggle } from './chart-parts';
import { FILL } from './chart-tones';
import { KpiTile } from './kpi-tile';
import { CardHeadingSkeleton, KpiRowSkeleton, TableRowsSkeleton } from './report-skeletons';
import { sharePercent, shownPieces, splitBar, type SplitPiece, stockCount, stockMoney, TileFoot, TileLegend } from './stock-parts';
import { summaryColumns } from './summary-strip';
import { ErrorCard, errorMessageFor } from './tabular-report-view';

type Tiles = StockValuationBreakdown['tiles'];
type Categories = StockValuationBreakdown['categories'];
type Dead = StockValuationBreakdown['dead'];
type DeadDays = 90 | 180 | 365;

/** Rows a share card shows on one page. */
const PAGE_SIZE = 10;

/** Dead-stock rows listed before the rest fold. */
const DEAD_SHOWN = 10;

const DEAD_DAYS: DeadDays[] = [90, 180, 365];

const TH = 'text-muted-foreground px-3 py-2 text-[11.5px] font-semibold tracking-wide whitespace-nowrap uppercase';
const TD = 'px-3 py-2.5 align-middle whitespace-nowrap';
const NUM = 'text-right tabular-nums';
const TOTAL_ROW = 'bg-muted/40 border-border border-t font-semibold';

/* ─────────────────────────── tiles ─────────────────────────── */

/** The value tile's top categories: three chart tones away from the stock statuses, the rest gray. */
const TOP_CATEGORY_FILLS = [FILL.violet, FILL.pink, FILL['access-file']];

/** The three most valuable categories and "อื่น ๆ" for the rest, each with its % of the value. */
function categoryPieces(categories: Categories, total: number, t: (key: string) => string, lang: string): SplitPiece[] {
    const piece = (key: string, label: string, fill: string, value: number): SplitPiece => ({
        key,
        label,
        fill,
        value,
        text: `${sharePercent(value, total)}%`,
    });
    const top = categories
        .slice(0, TOP_CATEGORY_FILLS.length)
        .map((c, i) =>
            piece(String(c.category_id ?? 'none'), localPair(c.name, c.name_th, lang) ?? t('rep_wo_no_category'), TOP_CATEGORY_FILLS[i], c.value),
        );
    const rest = categories.slice(TOP_CATEGORY_FILLS.length).reduce((s, c) => s + c.value, 0);
    return shownPieces(categories.length > TOP_CATEGORY_FILLS.length ? [...top, piece('others', t('rep_sva_k_others'), FILL.gray, rest)] : top);
}

function ValueTiles({ tiles, categories, asOf }: { tiles: Tiles; categories: Categories; asOf: string }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    const n = (v: number) => stockCount(v, lang);
    const deadShare = sharePercent(tiles.dead90.value, tiles.value);
    const foot = (template: string, bold: Record<string, string>) => <TileFoot template={template} bold={bold} />;
    const valuePieces = categoryPieces(categories, tiles.value, t, lang);
    const heldPieces = shownPieces([
        { key: 'held', label: t('rep_sva_k_held'), fill: FILL.green, value: tiles.held, text: n(tiles.held) },
        { key: 'out', label: t('stock_st_out'), fill: FILL.red, value: tiles.out, text: n(tiles.out) },
    ]);

    return (
        <div className={cn('grid grid-cols-2 gap-3', summaryColumns(4))}>
            <KpiTile
                label={t('rep_sva_k_value')}
                value={stockMoney(tiles.value, lang)}
                bar={valuePieces.length > 0 ? splitBar(valuePieces) : undefined}
                footer={valuePieces.length > 0 ? <TileLegend pieces={valuePieces} /> : undefined}
            />
            <KpiTile
                label={t('rep_sva_k_qty')}
                value={n(tiles.qty)}
                unit={t('rep_sva_unit')}
                footer={foot('rep_sva_k_qty_foot', { n: n(tiles.held), date: fmt.date(asOf) })}
            />
            <KpiTile
                label={t('rep_sva_k_held')}
                value={n(tiles.held)}
                unit={t('rep_sva_k_held_of').replace('{n}', n(tiles.items))}
                alert={tiles.out > 0 ? 'amber' : undefined}
                bar={heldPieces.length > 0 ? splitBar(heldPieces) : undefined}
                footer={heldPieces.length > 0 ? <TileLegend pieces={heldPieces} /> : undefined}
            />
            <KpiTile
                label={t('rep_sva_k_dead')}
                value={stockMoney(tiles.dead90.value, lang)}
                alert={tiles.dead90.count > 0 ? 'amber' : undefined}
                badge={
                    tiles.dead90.value > 0 ? (
                        <StatusBadge tone="amber">{t('rep_sva_k_dead_share').replace('{pct}', String(deadShare))}</StatusBadge>
                    ) : undefined
                }
                footer={foot('rep_sva_items', { n: n(tiles.dead90.count) })}
            />
        </div>
    );
}

/* ─────────────────────────── value by category / warehouse ─────────────────────────── */

interface ShareRow {
    key: string;
    name: string;
    items: number;
    qty: number;
    value: number;
}

/** A share of the card's total: brand bar and the percent beside it. */
function ShareBar({ value, total, name }: { value: number; total: number; name: string }) {
    const lang = useUiStore((s) => s.lang);
    const percent = total > 0 ? (value / total) * 100 : 0;
    const label = `${percent.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

    return (
        <span className="flex min-w-32 items-center gap-2">
            <span role="img" aria-label={`${name} ${label}`} className="dark:bg-muted block h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                <span className="bg-brand block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(1, percent))}%` }} />
            </span>
            <small className="text-muted-foreground w-12 shrink-0 text-right text-xs tabular-nums">{label}</small>
        </span>
    );
}

function ShareCard({
    title,
    caption,
    nameHeading,
    totalKey,
    rows,
    empty,
}: {
    title: string;
    caption: string;
    nameHeading: string;
    totalKey: string;
    rows: ShareRow[];
    empty: React.ReactNode;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [page, setPage] = useState(1);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const current = Math.min(page, pages);
    const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
    const qty = rows.reduce((s, r) => s + r.qty, 0);
    const value = rows.reduce((s, r) => s + r.value, 0);

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle title={title} />
            {rows.length === 0 ? (
                empty
            ) : (
                <>
                    <div className="relative overflow-x-auto">
                        <table className="w-full text-sm">
                            <caption className="sr-only">{caption}</caption>
                            <thead>
                                <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                    <th scope="col" className={cn(TH, 'text-left')}>
                                        {nameHeading}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('rep_sva_col_qty')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-right')}>
                                        {t('rep_sva_col_value')}
                                    </th>
                                    <th scope="col" className={cn(TH, 'text-left')}>
                                        {t('rep_sva_col_share')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((r) => (
                                    <tr key={r.key} className="border-border/60 border-b last:border-b-0">
                                        <th scope="row" className={cn(TD, 'max-w-60 text-left font-normal')}>
                                            <span className="block truncate font-semibold" title={r.name}>
                                                {r.name}
                                            </span>
                                            <small className="text-muted-foreground block text-xs">
                                                {t('rep_sva_items').replace('{n}', stockCount(r.items, lang))}
                                            </small>
                                        </th>
                                        <td className={cn(TD, NUM)}>{stockCount(r.qty, lang)}</td>
                                        <td className={cn(TD, NUM, 'font-semibold')}>{stockMoney(r.value, lang)}</td>
                                        <td className={TD}>
                                            <ShareBar value={r.value} total={value} name={r.name} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className={TOTAL_ROW}>
                                    <th scope="row" className={cn(TD, 'text-left')}>
                                        {t(totalKey).replace('{n}', stockCount(rows.length, lang))}
                                    </th>
                                    <td className={cn(TD, NUM)}>{stockCount(qty, lang)}</td>
                                    <td className={cn(TD, NUM)}>{stockMoney(value, lang)}</td>
                                    <td className={TD} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <CardPager page={current} total={rows.length} pageSize={PAGE_SIZE} onPage={setPage} />
                </>
            )}
        </Card>
    );
}

function ShareCards({ data }: { data: StockValuationBreakdown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const categories: ShareRow[] = data.categories.map((c) => ({
        key: String(c.category_id ?? 'none'),
        name: localPair(c.name, c.name_th, lang) ?? t('rep_wo_no_category'),
        items: c.items,
        qty: c.qty,
        value: c.value,
    }));
    const warehouses: ShareRow[] = (data.warehouses ?? []).map((w) => ({
        key: String(w.warehouse_id ?? 'none'),
        name: w.name ?? t('rep_sva_no_wh'),
        items: w.items,
        qty: w.qty,
        value: w.value,
    }));

    return (
        // Own heights, top aligned; stacked on a tablet (iPad mini 768px).
        <div className="grid items-start gap-3 lg:grid-cols-2">
            <ShareCard
                title={t('rep_sva_cat_title')}
                caption={t('rep_sva_cat_caption')}
                nameHeading={t('rep_sva_col_cat')}
                totalKey="rep_sva_cat_total"
                rows={categories}
                empty={<CardEmpty>{t('rep_sva_cat_empty')}</CardEmpty>}
            />
            <ShareCard
                title={t('rep_sva_wh_title')}
                caption={t('rep_sva_wh_caption')}
                nameHeading={t('rep_sva_col_wh')}
                totalKey="rep_sva_wh_total"
                rows={warehouses}
                empty={
                    <CardEmpty>
                        {data.warehouses === null ? (
                            <span>
                                <b className="text-foreground block font-semibold">{t('rep_sva_wh_past')}</b>
                                {t('rep_sva_wh_past_hint')}
                            </span>
                        ) : (
                            t('rep_sva_wh_empty')
                        )}
                    </CardEmpty>
                }
            />
        </div>
    );
}

/* ─────────────────────────── dead stock ─────────────────────────── */

function DaysSegment({ days, onPick }: { days: DeadDays; onPick: (next: DeadDays) => void }) {
    const t = useT();
    return (
        <span className="inline-flex items-center gap-2">
            <span>{t('rep_sva_dead_seg')}</span>
            <span
                role="group"
                aria-label={t('rep_sva_dead_seg')}
                className="border-border bg-card dark:bg-background inline-flex gap-0.5 rounded-md border p-0.5"
            >
                {DEAD_DAYS.map((d) => (
                    <button
                        key={d}
                        type="button"
                        aria-pressed={days === d}
                        onClick={() => onPick(d)}
                        className={cn(
                            'focus-visible:ring-brand focus-visible:ring-offset-background inline-flex h-6 items-center rounded px-2.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
                            days === d ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                        )}
                    >
                        {t(`rep_sva_dead_${d}`)}
                    </button>
                ))}
            </span>
        </span>
    );
}

function DeadCard({ dead }: { dead: Dead }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    const [days, setDays] = useState<DeadDays>(90);
    const [open, setOpen] = useState(false);
    const rows = dead.filter((d) => d.days > days);
    const { folds, shown } = fold(rows, DEAD_SHOWN, open, 0);
    const pick = (next: DeadDays) => {
        setDays(next);
        setOpen(false);
    };
    const headings: { key: string; right?: boolean }[] = [
        { key: 'rep_sva_dead_col_item' },
        { key: 'rep_sva_col_cat' },
        { key: 'rep_sva_dead_col_qty', right: true },
        { key: 'rep_sva_col_value', right: true },
        { key: 'rep_sva_dead_col_last' },
    ];

    return (
        <Card className="flex flex-col overflow-hidden">
            <CardTitle
                title={t('rep_sva_dead_title')}
                info={[t('rep_sva_dead_info_scope'), t('rep_sva_dead_info_status')]}
                sub={<DaysSegment days={days} onPick={pick} />}
            />
            {rows.length === 0 ? (
                <CardEmpty>{t('rep_sva_dead_empty').replace('{period}', t(`rep_sva_dead_${days}`))}</CardEmpty>
            ) : (
                <>
                    <div className="relative overflow-x-auto">
                        <table className="w-full text-sm">
                            <caption className="sr-only">{t('rep_sva_dead_caption')}</caption>
                            <thead>
                                <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
                                    {headings.map((h) => (
                                        <th key={h.key} scope="col" className={cn(TH, h.right ? 'text-right' : 'text-left')}>
                                            {t(h.key)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((d) => (
                                    <tr key={d.item_id} className="border-border/60 border-b last:border-b-0">
                                        <th scope="row" className={cn(TD, 'max-w-80 text-left font-normal')}>
                                            <span className="block truncate" title={d.name}>
                                                {d.name}
                                            </span>
                                            <small className="text-muted-foreground block truncate text-xs">{d.sku}</small>
                                        </th>
                                        <td className={TD}>{localPair(d.category, d.category_th, lang) ?? t('rep_wo_no_category')}</td>
                                        <td className={cn(TD, NUM)}>
                                            {stockCount(d.qty, lang)} {d.unit ?? ''}
                                        </td>
                                        <td className={cn(TD, NUM, 'font-semibold')}>{stockMoney(d.value, lang)}</td>
                                        <td className={TD}>
                                            <span className="block text-xs">{fmt.date(d.last_move)}</span>
                                            <small className="text-muted-foreground block text-xs">
                                                {t('rep_sva_days_ago').replace('{n}', stockCount(d.days, lang))}
                                            </small>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className={TOTAL_ROW}>
                                    <th scope="row" colSpan={2} className={cn(TD, 'text-left')}>
                                        {t('rep_sva_dead_total').replace('{n}', stockCount(rows.length, lang))}
                                    </th>
                                    <td className={cn(TD, NUM)}>
                                        {stockCount(
                                            rows.reduce((s, d) => s + d.qty, 0),
                                            lang,
                                        )}
                                    </td>
                                    <td className={cn(TD, NUM)}>
                                        {stockMoney(
                                            rows.reduce((s, d) => s + d.value, 0),
                                            lang,
                                        )}
                                    </td>
                                    <td className={TD} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    {folds && <FoldToggle open={open} total={rows.length} onToggle={() => setOpen((v) => !v)} />}
                </>
            )}
        </Card>
    );
}

/* ─────────────────────────── the page's cards ─────────────────────────── */

function CardsSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            <KpiRowSkeleton count={4} className={summaryColumns(4)} />
            <div className="grid items-start gap-3 lg:grid-cols-2">
                <Card className="overflow-hidden">
                    <CardHeadingSkeleton note={false} />
                    <TableRowsSkeleton rows={5} />
                </Card>
                <Card className="overflow-hidden">
                    <CardHeadingSkeleton note={false} />
                    <TableRowsSkeleton rows={3} />
                </Card>
            </div>
            <Card className="overflow-hidden">
                <CardHeadingSkeleton />
                <TableRowsSkeleton rows={4} />
            </Card>
        </div>
    );
}

export function StockValuationCards({ filters }: { filters: TabularFilters }) {
    const t = useT();
    const { data, isLoading, isError, error } = useStockValuationBreakdown(filters);

    if (isError) return <ErrorCard message={errorMessageFor(t, error)} />;
    if (isLoading || !data) return <CardsSkeleton />;

    return (
        <div className="space-y-4">
            <ValueTiles tiles={data.tiles} categories={data.categories} asOf={data.as_of} />
            {/* A new day or category starts both share cards on page 1. */}
            <ShareCards key={`${filters.as_of ?? ''}|${filters.category_id ?? ''}`} data={data} />
            <DeadCard dead={data.dead} />
        </div>
    );
}
