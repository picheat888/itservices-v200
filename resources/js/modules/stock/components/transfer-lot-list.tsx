// Transfer form (board 6): tick the whole Lots of the source warehouse that move, with the total they carry.
import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { FormErrorBanner } from '@/shared/components/field';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { StockLotRow } from '@/shared/types';
import { useEffect, useId, useRef } from 'react';

const ROW = 'grid grid-cols-[1rem_minmax(0,1fr)_6.5rem_4rem] items-center gap-2.5 px-3';

export function TransferLotList({
    lots,
    from,
    to,
    unit,
    isSerial,
    selected,
    onChange,
    error,
}: {
    /** Lots of the source warehouse that still hold stock. */
    lots: StockLotRow[];
    from: string;
    to: string;
    unit: string | null;
    isSerial: boolean;
    selected: Set<number>;
    onChange: (ids: Set<number>) => void;
    error?: string;
}) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const titleId = useId();
    const errorId = useId();
    const groupRef = useRef<HTMLDivElement>(null);
    const picked = lots.filter((l) => selected.has(l.id));

    // A server refusal lands on the lot list, so keyboard and screen-reader users hear it there
    useEffect(() => {
        if (error) groupRef.current?.focus();
    }, [error]);
    const total = picked.reduce((sum, l) => sum + l.qty_remaining, 0);

    const toggle = (id: number) => {
        const next = new Set(selected);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        onChange(next);
    };

    if (lots.length === 0) {
        return (
            <EmptyState
                kind="pick"
                title={t('stock_empty_transfer_lots').replace('{warehouse}', from)}
                hint={t('stock_empty_transfer_lots_hint')}
                className="min-h-0 rounded-md border border-dashed py-4"
            />
        );
    }

    return (
        <div className="space-y-2">
            <div className={cn('overflow-hidden rounded-lg border', error && 'border-destructive')}>
                {/* Header */}
                <div className="bg-muted/40 flex items-center gap-2 px-3 py-2">
                    <span id={titleId} className="text-muted-foreground flex-1 text-xs font-semibold">
                        {t('stock_transfer_pick_lots')}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                        {t('stock_transfer_picked').replace('{picked}', fmtN(picked.length)).replace('{count}', fmtN(lots.length))}
                    </span>
                </div>
                <div className={cn(ROW, TABLE_HEAD, 'text-muted-foreground border-t py-1.5 text-xs font-medium')} aria-hidden>
                    <span />
                    <span>{t('stock_lot_word')}</span>
                    <span>{t('stock_transfer_col_received')}</span>
                    <span className="text-right">{t('stock_lot_remaining')}</span>
                </div>

                {/* Lot rows */}
                <div
                    ref={groupRef}
                    role="group"
                    tabIndex={-1}
                    aria-labelledby={titleId}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    className="focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset"
                >
                    {lots.map((lot) => {
                        const checked = selected.has(lot.id);
                        return (
                            <label
                                key={lot.id}
                                className={cn(
                                    ROW,
                                    'cursor-pointer border-t py-2.5 text-sm transition-colors',
                                    checked ? 'bg-brand/5' : 'hover:bg-muted/50',
                                )}
                            >
                                <input
                                    name="lot_ids"
                                    type="checkbox"
                                    className="accent-brand h-4 w-4 rounded"
                                    checked={checked}
                                    onChange={() => toggle(lot.id)}
                                />
                                <span className="truncate font-semibold tabular-nums" translate="no">
                                    {lot.lot_no ?? t('stock_lot_before_tracking')}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                    <span className="sr-only">{t('stock_transfer_col_received')} </span>
                                    {lot.received_at ? fmt.date(lot.received_at) : '—'}
                                </span>
                                <span className="text-right tabular-nums">
                                    <span className="sr-only">{t('stock_lot_remaining')} </span>
                                    {fmtN(lot.qty_remaining)}
                                </span>
                            </label>
                        );
                    })}
                </div>

                {/* Footer total */}
                <div className="flex items-center border-t px-3 py-2 text-sm">
                    <span className="flex-1">{t('stock_transfer_total')}</span>
                    <b className="tabular-nums" aria-live="polite">
                        {fmtN(total)} {unit ?? t('stock_units')}
                    </b>
                </div>
            </div>
            <div id={errorId}>{error && <FormErrorBanner message={error} className="text-xs" />}</div>

            <p className="text-muted-foreground text-xs leading-relaxed">
                {t('stock_transfer_note').replace('{warehouse}', to || t('stock_to_warehouse'))}
                {isSerial && (
                    <>
                        <br />
                        {t('stock_transfer_serial_note')}
                    </>
                )}
            </p>
        </div>
    );
}
