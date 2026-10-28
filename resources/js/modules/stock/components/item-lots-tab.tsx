// Lot tab of the item detail: scan/type filter, in-stock chips, and the lot table with print buttons.
import { useT } from '@/lang';
import { useCurrency } from '@/modules/settings';
import { EmptyState } from '@/shared/components/empty-state';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { StockLotRow } from '@/shared/types';
import { Input } from '@/shared/ui/input';
import { Printer, Search } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { lotLabelsPdfUrl } from '../api/stockApi';
import { parseLotCode } from '../lib/lot-code';
import { LotLink } from './lot-link';

type LotView = 'in_stock' | 'empty' | 'all';

const CHIP =
    'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium focus-visible:ring-2 focus-visible:outline-hidden';
const TH = 'px-3 py-2 font-medium';

export function ItemLotsTab({ lots }: { lots: StockLotRow[] }) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const { format } = useCurrency();
    const searchId = useId();
    const [view, setView] = useState<LotView>('in_stock');
    const [raw, setRaw] = useState('');

    const inStock = useMemo(() => lots.filter((l) => l.qty_remaining > 0), [lots]);
    const totalValue = useMemo(() => inStock.reduce((sum, l) => sum + l.value, 0), [inStock]);
    const needle = (parseLotCode(raw) ?? raw).trim().toLowerCase();
    const shown = lots.filter((l) => {
        if (view === 'in_stock' && l.qty_remaining <= 0) return false;
        if (view === 'empty' && l.qty_remaining > 0) return false;
        return needle === '' || (l.lot_no ?? '').toLowerCase().includes(needle);
    });

    const chips: { id: LotView; label: string; count: number }[] = [
        { id: 'in_stock', label: t('stock_lots_in_stock'), count: inStock.length },
        { id: 'empty', label: t('stock_lots_emptied'), count: lots.length - inStock.length },
        { id: 'all', label: t('stock_lots_all'), count: lots.length },
    ];

    return (
        <div className="space-y-3">
            {/* Scan or type a Lot number (never autofocused, so the iPad keyboard stays down) */}
            <div className="relative max-w-xs">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" aria-hidden />
                <Input
                    id={searchId}
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder={t('stock_scan_lot_ph')}
                    aria-label={t('stock_scan_lot_ph')}
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    className="pl-9 text-ellipsis"
                />
            </div>

            {/* Chips and total */}
            <div className="flex flex-wrap items-center gap-2">
                {chips.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        aria-pressed={view === c.id}
                        onClick={() => setView(c.id)}
                        className={cn(CHIP, view === c.id ? 'border-brand bg-brand/10 text-brand-ink' : 'border-border bg-card hover:bg-accent')}
                    >
                        {c.label}
                        <span className="tabular-nums">{fmtN(c.count)}</span>
                    </button>
                ))}
                <span className="text-muted-foreground ml-auto text-xs">
                    {t('stock_lots_total_value')} <span className="text-foreground text-sm font-semibold tabular-nums">{format(totalValue)}</span>
                </span>
            </div>

            {shown.length > 0 ? (
                <div className="border-border overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                        <thead className={TABLE_HEAD}>
                            <tr className="border-border text-muted-foreground border-b text-left text-xs">
                                <th scope="col" className={TH}>
                                    {t('stock_hist_col_lot')}
                                </th>
                                <th scope="col" className={TH}>
                                    {t('stock_lots_col_held_at')}
                                </th>
                                <th scope="col" className={TH}>
                                    {t('stock_lots_col_received_on')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('stock_unit_cost_short')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('stock_lots_col_received')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('stock_lots_col_out')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('stock_lots_col_back')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('stock_lot_remaining')}
                                </th>
                                <th scope="col" className={cn(TH, 'text-right')}>
                                    {t('stock_lot_value')}
                                </th>
                                <th scope="col" className="w-10 px-2 py-2">
                                    <span className="sr-only">{t('stock_lot_print_sticker')}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((l) => (
                                <tr key={l.id} className="border-border/60 border-b last:border-0">
                                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                                        <LotLink lotNo={l.lot_no} newTab />
                                    </td>
                                    <td className="px-3 py-2 text-xs whitespace-nowrap">{l.warehouse}</td>
                                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                                        <div>{fmt.date(l.received_at)}</div>
                                        <div className="text-muted-foreground" translate="no">
                                            {l.received_doc_no ?? l.doc_no ?? '—'}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap tabular-nums">{format(l.unit_cost)}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{fmtN(l.qty_received)}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{fmtN(l.qty_issued)}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{fmtN(l.qty_returned)}</td>
                                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap tabular-nums">{fmtN(l.qty_remaining)}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{format(l.value)}</td>
                                    <td className="px-2 py-2">
                                        {l.lot_no && (
                                            <a
                                                href={lotLabelsPdfUrl(l.lot_no)}
                                                target="_blank"
                                                rel="noopener"
                                                aria-label={`${t('stock_lot_print_sticker')} ${l.lot_no}`}
                                                className="hover:bg-accent focus-visible:ring-ring flex h-8 w-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-hidden"
                                            >
                                                <Printer className="h-4 w-4" aria-hidden />
                                            </a>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : lots.length === 0 ? (
                <EmptyState
                    title={t('stock_empty_item_modal_lots')}
                    hint={t('stock_empty_item_modal_lots_hint')}
                    className="min-h-0 rounded-lg border border-dashed py-5"
                />
            ) : (
                <EmptyState
                    kind="search"
                    title={t('stock_empty_item_lots_filtered')}
                    hint={t('stock_empty_item_lots_filtered_hint')}
                    className="min-h-0 rounded-lg border border-dashed py-5"
                />
            )}

            <p className="text-muted-foreground text-xs">{t('stock_lots_formula_note')}</p>
        </div>
    );
}
