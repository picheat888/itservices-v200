// Lot card shared by the receive done screen and the receive event detail: lot number, facts, QR preview and sticker reprint.
import { useT } from '@/lang';
import { useCurrency } from '@/modules/settings';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import type { LotState } from '@/shared/types';
import { buttonVariants } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { Printer } from 'lucide-react';
import { useId, useState } from 'react';
import { lotLabelsPdfUrl, lotQrUrl } from '../api/stockApi';
import { LotLink } from './lot-link';
import { LotStateBadge } from './lot-state-badge';

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

/** The receive event's Lot card before its read arrives: the same frame and rows, bars in place of the values. */
export function LotCardSkeleton() {
    return (
        <div className="border-border rounded-xl border p-3.5" aria-hidden>
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <Skeleton className="my-0.5 h-6 w-48" />
                        <Skeleton className="ml-auto h-5 w-14 rounded-full" />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {[0, 1].map((i) => (
                            <div key={i}>
                                <Skeleton className="my-0.5 h-3 w-20" />
                                <Skeleton className="mt-1 h-4 w-16" />
                            </div>
                        ))}
                    </div>
                </div>
                <Skeleton className="h-18 w-18 shrink-0" />
            </div>
            <div className="border-border mt-3 flex items-end gap-3 border-t pt-3">
                <div className="flex flex-col gap-1">
                    <Skeleton className="my-0.5 h-3 w-24" />
                    <Skeleton className="h-9 w-20" />
                </div>
                <Skeleton className="ml-auto h-9 w-40" />
            </div>
            <Skeleton className="mt-2.5 h-3 w-3/4" />
        </div>
    );
}

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
                        <LotLink lotNo={lotNo} newTab className="text-lg font-bold tracking-wide tabular-nums" />
                        {state && <LotStateBadge state={state} className="ml-auto shrink-0" />}
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
                        alt=""
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
