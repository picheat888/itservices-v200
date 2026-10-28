// Lot card shared by the receive done screen and the receive event detail: lot number, facts, QR preview and sticker reprint.
import { useT } from '@/lang';
import { useCurrency } from '@/modules/settings';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import type { LotState } from '@/shared/types';
import { buttonVariants } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Printer } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { lotLabelsPdfUrl, lotQrUrl } from '../api/stockApi';

interface LotCardProps {
    lotNo: string;
    /** null = Unassigned. */
    warehouse: string | null;
    qty?: number;
    remaining?: number;
    unitCost?: number;
    state?: LotState;
    unit?: string | null;
    printable: boolean;
}

const LABEL = 'text-muted-foreground text-xs';

export function LotCard({ lotNo, warehouse, qty, remaining, unitCost, state, unit, printable }: LotCardProps) {
    const t = useT();
    const fmtN = useNumberFormat();
    const { format } = useCurrency();
    const copiesId = useId();
    const [copies, setCopies] = useState('1');
    const copiesNum = Math.min(99, Math.max(1, Math.floor(Number(copies)) || 1));
    const withUnit = (n: number) => `${fmtN(n)} ${unit ?? ''}`.trim();

    return (
        <div className="border-border rounded-xl border p-3.5">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <Link
                            to={`/stock/lots/${encodeURIComponent(lotNo)}`}
                            className="text-lg font-bold tracking-wide tabular-nums hover:underline"
                        >
                            {lotNo}
                        </Link>
                        {state && (
                            <span
                                className={cn(
                                    'ml-auto inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold',
                                    state === 'empty'
                                        ? 'bg-muted text-muted-foreground'
                                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                                )}
                            >
                                {state === 'empty' ? t('stock_lots_emptied') : t('stock_lots_in_stock')}
                            </span>
                        )}
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                        <div>
                            <dt className={LABEL}>{remaining !== undefined ? t('stock_recv_lot_now_at') : t('stock_lot_held_at')}</dt>
                            <dd className="font-medium">{warehouse ?? t('stock_lot_unassigned')}</dd>
                        </div>
                        {qty !== undefined && (
                            <div>
                                <dt className={LABEL}>{t('stock_lot_qty_in_lot')}</dt>
                                <dd className="font-medium tabular-nums">{withUnit(qty)}</dd>
                            </div>
                        )}
                        {remaining !== undefined && (
                            <div>
                                <dt className={LABEL}>{t('stock_recv_lot_left')}</dt>
                                <dd className="font-medium tabular-nums">{withUnit(remaining)}</dd>
                            </div>
                        )}
                        {unitCost !== undefined && (
                            <div>
                                <dt className={LABEL}>{t('stock_lot_unit_cost')}</dt>
                                <dd className="font-medium tabular-nums">{format(unitCost)}</dd>
                            </div>
                        )}
                    </dl>
                </div>
                {printable && (
                    <img
                        src={lotQrUrl(lotNo)}
                        alt={lotNo}
                        width={72}
                        height={72}
                        className="border-border h-18 w-18 shrink-0 rounded-md border bg-white p-1"
                    />
                )}
            </div>
            {printable && (
                <>
                    <div className="border-border mt-3 flex items-end gap-3 border-t pt-3">
                        <div className="flex flex-col gap-1">
                            <label htmlFor={copiesId} className={LABEL}>
                                {t('stock_lot_sticker_copies')}
                            </label>
                            <Input
                                id={copiesId}
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={99}
                                value={copies}
                                onChange={(e) => setCopies(e.target.value)}
                                onBlur={() => setCopies(String(copiesNum))}
                                className="h-9 w-20 text-right"
                            />
                        </div>
                        <a
                            href={lotLabelsPdfUrl(lotNo, copiesNum)}
                            target="_blank"
                            rel="noopener"
                            className={cn(buttonVariants({ variant: 'outline' }), 'ml-auto')}
                        >
                            <Printer className="h-4 w-4" aria-hidden />
                            {t('stock_lot_print_stickers')}
                            <span className="sr-only">{t('stock_opens_new_tab')}</span>
                        </a>
                    </div>
                    <p className={cn(LABEL, 'mt-2')}>{t('stock_lot_sticker_hint')}</p>
                </>
            )}
        </div>
    );
}
