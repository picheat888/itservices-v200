// SKU history overview: on hand, FIFO value and reconciliation facts, then the reconciliation, warehouse and open-lot tables.
// The PDF summary (resources/views/pdf/stock-history.blade.php) prints the same blocks.
import type { useT } from '@/lang';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { StockItemHistory, StockMovementType } from '@/shared/types';
import type { ReactNode } from 'react';

type Translate = ReturnType<typeof useT>;

const MOVE_DOT: Record<StockMovementType, string> = {
    receive: 'bg-emerald-600',
    return: 'bg-teal-600',
    adjust_up: 'bg-amber-600',
    issue: 'bg-red-600',
    adjust_down: 'bg-amber-600',
    transfer: 'bg-blue-600',
};

export function SummaryFacts({ data, t, formatMoney }: { data: StockItemHistory; t: Translate; formatMoney: (value: number) => string }) {
    const fmtN = useNumberFormat();
    const { difference } = data.reconciliation;
    const reconciled = difference === 0;
    return (
        <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3 print:hidden">
            <Fact label={t('stock_current')}>
                {fmtN(data.item.current_stock)} {data.item.unit ?? ''}
            </Fact>
            <Fact label={t('stock_hist_stock_value')}>{formatMoney(data.item.stock_value)}</Fact>
            <Fact label={t('stock_hist_reconcile')}>
                <span className={reconciled ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}>
                    {reconciled ? t('stock_hist_reconciled') : t('stock_hist_off_by').replace('{n}', fmtN(difference))}
                </span>
            </Fact>
        </div>
    );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="border-border bg-muted/30 rounded-lg border px-4 py-2">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="text-lg font-bold tabular-nums">{children}</div>
        </div>
    );
}

export function StockSummary({ data, t, formatMoney }: { data: StockItemHistory; t: Translate; formatMoney: (value: number) => string }) {
    const fmtN = useNumberFormat();
    const { date } = useDateFormat();
    const rec = data.reconciliation;
    const openLots = data.lots.filter((l) => l.qty_remaining > 0);
    const effect = (sign: number, qty: number) => (sign === 0 ? t('stock_hist_between') : qty === 0 ? '0' : `${sign > 0 ? '+' : '−'}${fmtN(qty)}`);

    return (
        <div className="mb-6 grid gap-6">
            <Section title={t('stock_hist_reconcile')}>
                <SimpleTable
                    headers={[t('stock_mv_type'), t('stock_hist_entries'), t('stock_qty'), t('stock_hist_effect')]}
                    numeric={[1, 2, 3]}
                    rows={rec.lines.map((line) => [
                        <span className="inline-flex items-center gap-2">
                            <span className={cn('h-2 w-2 rounded-sm', MOVE_DOT[line.type])} aria-hidden />
                            {t(`stock_mv_${line.type}` as Parameters<Translate>[0])}
                        </span>,
                        fmtN(line.count),
                        fmtN(line.qty),
                        <span
                            className={cn(
                                line.sign > 0 && line.qty > 0 && 'text-emerald-700 dark:text-emerald-400',
                                line.sign < 0 && line.qty > 0 && 'text-destructive',
                                line.sign === 0 && 'text-muted-foreground',
                            )}
                        >
                            {effect(line.sign, line.qty)}
                        </span>,
                    ])}
                    totals={[
                        [t('stock_hist_calculated'), '', '', fmtN(rec.computed)],
                        [t('stock_hist_recorded'), '', '', fmtN(rec.current)],
                    ]}
                />
            </Section>

            <Section title={t('stock_hist_by_warehouse')}>
                <SimpleTable
                    headers={[t('stock_warehouse'), t('stock_qty')]}
                    numeric={[1]}
                    rows={data.balances.map((b) => [b.warehouse ?? '—', fmtN(b.qty)])}
                    totals={data.balances.length ? [[t('stock_mv_total'), fmtN(data.balances.reduce((sum, b) => sum + b.qty, 0))]] : []}
                />
            </Section>

            <Section title={`${t('stock_hist_open_lots')} (${fmtN(openLots.length)})`}>
                <SimpleTable
                    headers={[
                        t('stock_hist_lot_from'),
                        t('stock_hist_receive_date'),
                        t('stock_cost'),
                        t('stock_hist_received_qty'),
                        t('stock_hist_remaining'),
                        t('stock_hist_value'),
                    ]}
                    numeric={[2, 3, 4, 5]}
                    rows={openLots.map((l) => [
                        l.doc_no ?? '—',
                        l.received_at ? date(l.received_at) : '—',
                        formatMoney(l.unit_cost),
                        fmtN(l.qty_received),
                        fmtN(l.qty_remaining),
                        formatMoney(l.qty_remaining * l.unit_cost),
                    ])}
                    totals={
                        openLots.length
                            ? [
                                  [
                                      t('stock_mv_total'),
                                      '',
                                      '',
                                      '',
                                      fmtN(openLots.reduce((sum, l) => sum + l.qty_remaining, 0)),
                                      formatMoney(data.item.stock_value),
                                  ],
                              ]
                            : []
                    }
                />
            </Section>
        </div>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <h2 className="mb-2 text-sm font-semibold">{title}</h2>
            {children}
        </section>
    );
}

function SimpleTable({ headers, rows, numeric, totals }: { headers: string[]; rows: ReactNode[][]; numeric: number[]; totals: ReactNode[][] }) {
    const align = (i: number) => (numeric.includes(i) ? 'text-right tabular-nums' : 'text-left');
    return (
        <div className="border-border overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
                <thead className={TABLE_HEAD}>
                    <tr className="text-muted-foreground border-border border-b text-xs font-semibold">
                        {headers.map((h, i) => (
                            <th key={i} scope="col" className={cn('px-3 py-2 whitespace-nowrap', align(i))}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((cells, r) => (
                        <tr key={r} className="border-border/60 border-b last:border-0">
                            {cells.map((c, i) => (
                                <td key={i} className={cn('px-3 py-2 whitespace-nowrap', align(i))}>
                                    {c}
                                </td>
                            ))}
                        </tr>
                    ))}
                    {totals.map((cells, r) => (
                        <tr key={`t${r}`} className="border-border bg-muted/40 border-t font-semibold">
                            {cells.map((c, i) => (
                                <td key={i} className={cn('px-3 py-2 whitespace-nowrap', align(i))}>
                                    {c}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
