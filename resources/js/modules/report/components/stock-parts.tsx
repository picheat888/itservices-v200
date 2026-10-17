// Stock report helpers: numbers, money, day counts, the tile footer and split legend, the last-move cell and the movement colours of the stock pages (MV_META), shared by the three stock reports.
import { useT } from '@/lang';
import { MV_META } from '@/modules/stock';
import { InfoPopover } from '@/shared/components/info-popover';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { formatNumber } from '@/shared/lib/number';
import { cn } from '@/shared/lib/utils';
import type { StockMovementType } from '@/shared/types';
import { useUiStore } from '@/stores/ui';
import type { ChartTone } from '../types';
import { rich, Swatch } from './chart-parts';

export type Lang = 'th' | 'en';

const DAY_MS = 86_400_000;

/** A count with thousands separators. */
export const stockCount = (n: number, lang: Lang) => formatNumber(n, lang);

/** Money with 2 decimals and no ฿. */
export const stockMoney = (n: number, lang: Lang) => formatNumber(n, lang, { decimals: 2 });

/** Money with "−" in front when below zero. */
export const signedMoney = (n: number, lang: Lang) => `${n < 0 ? '−' : ''}${stockMoney(Math.abs(n), lang)}`;

/** Pieces with "+" or "−" in front, none at zero. */
export const signedCount = (n: number, lang: Lang) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${stockCount(Math.abs(n), lang)}`;

/** Local midnight of a day ("2026-09-22", "2026-09-22 09:00:00") or an ISO moment ("2026-09-22T09:00:00+07:00"). */
const dayStart = (value: string) => {
    if (value.includes('T')) return new Date(value).setHours(0, 0, 0, 0);
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
};

/** Whole days from `from`'s day to `to`'s day (today when none), never below 0. */
export function daysBetween(from: string, to?: string | null): number {
    const end = to ? dayStart(to) : new Date().setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((end - dayStart(from)) / DAY_MS));
}

/** A tile's one-line footer: bold figures, cut at the tile's edge with the whole line on hover. */
export function TileFoot({ template, bold }: { template: string; bold: Record<string, string> }) {
    const t = useT();
    const text = t(template);
    const full = Object.entries(bold).reduce((line, [slot, value]) => line.replaceAll(`{${slot}}`, value), text);

    return (
        <span className="block truncate" title={full}>
            {rich(text, bold)}
        </span>
    );
}

/** One piece of a tile's split bar: its name, fill class, size and the figure its legend prints. */
export interface SplitPiece {
    key: string;
    label: string;
    fill: string;
    value: number;
    text: string;
}

/** Whole percent of `part` in `total`, 0 when there is no total. */
export const sharePercent = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** A split's pieces above zero: the tile's bar and its dot legend draw only these. */
export const shownPieces = (pieces: SplitPiece[]) => pieces.filter((p) => p.value > 0);

/** KpiTile `bar` pieces, each as its share of the split. */
export function splitBar(pieces: SplitPiece[]) {
    const total = pieces.reduce((s, p) => s + p.value, 0);
    return pieces.map((p) => ({ key: p.key, percent: (p.value / total) * 100, className: p.fill, title: `${p.label} ${p.text}` }));
}

/** A tile's dot legend on one line, as SummaryStrip: dots and figures stay, names cut with "…", the whole split opens in a note. */
export function TileLegend({ pieces }: { pieces: SplitPiece[] }) {
    return (
        <InfoPopover
            label={pieces.map((p) => `${p.label} ${p.text}`).join(', ')}
            className="grid min-w-0 auto-cols-[minmax(0,max-content)] grid-flow-col items-center gap-x-2.5 text-left"
            content={
                <div className="min-w-44 space-y-1">
                    {pieces.map((p) => (
                        <div key={p.key} className="flex items-center justify-between gap-4">
                            <Swatch fill={p.fill}>{p.label}</Swatch>
                            <b className="tabular-nums">{p.text}</b>
                        </div>
                    ))}
                </div>
            }
        >
            {pieces.map((p) => (
                <span key={p.key} className="flex min-w-0 items-center gap-1">
                    <i aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', p.fill)} />
                    <span className="truncate">{p.label}</span>
                    <b className="text-foreground shrink-0 font-semibold tabular-nums">{p.text}</b>
                </span>
            ))}
        </InfoPopover>
    );
}

/** The last move's date and how many days before `asOf` (today when none). */
export function LastMoveCell({ value, asOf }: { value: unknown; asOf?: unknown }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    if (typeof value !== 'string' || value === '') return <span className="text-muted-foreground">—</span>;
    const days = daysBetween(value, typeof asOf === 'string' && asOf !== '' ? asOf : null);

    return (
        <span>
            <span className="block text-xs">{fmt.date(value)}</span>
            <small className="text-muted-foreground block text-xs">{t('rep_sva_days_ago').replace('{n}', stockCount(days, lang))}</small>
        </span>
    );
}

/** Each movement type's colour as on /stock: receive green, issue violet, return blue, transfer amber. */
export const MV_TONE: Record<StockMovementType, ChartTone> = {
    receive: MV_META.receive.tone,
    issue: MV_META.issue.tone,
    return: MV_META.return.tone,
    transfer: MV_META.transfer.tone,
    adjust_up: MV_META.adjust_up.tone,
    adjust_down: MV_META.adjust_down.tone,
};

/** Text for a signed quantity, as /stock writes it: in green, out red, neither gray. */
export const SIGN_INK = {
    in: 'text-emerald-700 dark:text-emerald-400',
    out: 'text-destructive',
    none: 'text-muted-foreground',
} as const;

/** A movement type's sign ink: +1 in, −1 out, 0 transfer. */
export const signInk = (sign: number) => (sign > 0 ? SIGN_INK.in : sign < 0 ? SIGN_INK.out : SIGN_INK.none);

export { MV_META };
