// Stock report helpers: numbers, money and the movement colours of the stock pages (MV_META), shared by the three stock reports.
import { MV_META } from '@/modules/stock';
import type { StockMovementType } from '@/shared/types';
import type { ChartTone } from '../types';

export type Lang = 'th' | 'en';

const locale = (lang: Lang) => (lang === 'th' ? 'th-TH' : 'en-US');

/** A count with thousands separators. */
export const stockCount = (n: number, lang: Lang) => n.toLocaleString(locale(lang));

/** Money with 2 decimals and no ฿. */
export const stockMoney = (n: number, lang: Lang) => n.toLocaleString(locale(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Money with "−" in front when below zero. */
export const signedMoney = (n: number, lang: Lang) => `${n < 0 ? '−' : ''}${stockMoney(Math.abs(n), lang)}`;

/** Pieces with "+" or "−" in front, none at zero. */
export const signedCount = (n: number, lang: Lang) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${stockCount(Math.abs(n), lang)}`;

/** Each movement type's colour as on /stock: receive green, issue violet, return blue, transfer amber. */
export const MV_TONE: Record<StockMovementType, ChartTone> = {
    receive: MV_META.receive.tone,
    issue: MV_META.issue.tone,
    return: MV_META.return.tone,
    transfer: MV_META.transfer.tone,
    adjust_up: MV_META.adjust_up.tone,
    adjust_down: MV_META.adjust_down.tone,
};

/** Text for a signed quantity: in green, out violet, neither gray. */
export const SIGN_INK = {
    in: 'text-emerald-700 dark:text-emerald-400',
    out: 'text-violet-600 dark:text-violet-400',
    none: 'text-muted-foreground',
} as const;

/** A movement type's sign ink: +1 in, −1 out, 0 transfer. */
export const signInk = (sign: number) => (sign > 0 ? SIGN_INK.in : sign < 0 ? SIGN_INK.out : SIGN_INK.none);

export { MV_META };
