// Shared report card pieces: list folding, card pager, card headings, title with count, master-data label, stacked bar, month label, swatch.
import { useT } from '@/lang';
import { EmptyState, type EmptyKind } from '@/shared/components/empty-state';
import { InfoPopover } from '@/shared/components/info-popover';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { bindDateFormat } from '@/shared/lib/datetime';
import { localPair } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Info } from 'lucide-react';
import { Fragment } from 'react';
import type { ChartLabel, ChartSeries, ChartTone } from '../types';
import { CARD_HEADING_TINT } from './card-heading';
import { FILL, PIECE_INK, TEXT } from './chart-tones';

/** First `top` rows plus the rest to fold into "อื่น ๆ"; one spare row is shown instead of folding a single name. */
export function fold<T>(rows: T[], top: number, open: boolean, spare = 1) {
    const folds = rows.length > top + spare;
    const folded = folds && !open;

    return { folds, shown: folded ? rows.slice(0, top) : rows, rest: folded ? rows.slice(top) : [] };
}

/** "แสดงทั้งหมด (24)" / "ย่อ" under a folding list. */
export function FoldToggle({ open, total, onToggle }: { open: boolean; total: number; onToggle: () => void }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const Icon = open ? ChevronUp : ChevronDown;

    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring mt-auto flex w-full items-center justify-center gap-1.5 border-t py-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        >
            <Icon aria-hidden className="h-3.5 w-3.5" />
            {open ? t('rep_chart_show_less') : t('rep_chart_show_all').replace('{n}', fmtN(total))}
        </button>
    );
}

const PAGER_BUTTON =
    'border-border bg-background hover:bg-accent focus-visible:ring-ring flex h-7 w-7 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40';

/** "1–10 จาก 14 ‹ 1 / 2 ›" under a paged card; hidden at one page. */
export function CardPager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (next: number) => void }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const pages = Math.ceil(total / pageSize);
    if (pages <= 1) return null;
    const range = t('rep_chart_pager')
        .replace('{from}', fmtN((page - 1) * pageSize + 1))
        .replace('{to}', fmtN(Math.min(page * pageSize, total)))
        .replace('{total}', fmtN(total));

    return (
        <div className="text-muted-foreground mt-auto flex items-center justify-end gap-2 px-4 pt-2 pb-3 text-xs">
            <span aria-live="polite" className="tabular-nums">
                {range}
            </span>
            <button type="button" aria-label={t('page_prev')} disabled={page <= 1} onClick={() => onPage(page - 1)} className={PAGER_BUTTON}>
                <ChevronLeft aria-hidden className="h-4 w-4" />
            </button>
            <b className="text-foreground font-semibold tabular-nums">
                {fmtN(page)} / {fmtN(pages)}
            </b>
            <button type="button" aria-label={t('page_next')} disabled={page >= pages} onClick={() => onPage(page + 1)} className={PAGER_BUTTON}>
                <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
        </div>
    );
}

/** A 70×20 line of the tile's value across the period; empty points are skipped. */
export function Sparkline({ values, className }: { values: (number | null)[]; className: string }) {
    const known = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
    if (known.length < 2) return null;
    const W = 70;
    const H = 20;
    const lo = Math.min(...known.map((p) => p[1]));
    const hi = Math.max(...known.map((p) => p[1]));
    const x = (i: number) => 2 + (i * (W - 4)) / (values.length - 1);
    const y = (v: number) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 6);
    const line = known.map(([i, v], n) => `${n ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const [lastI, lastV] = known[known.length - 1];

    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={cn('shrink-0', className)} aria-hidden="true">
            <path d={`${line} L${x(lastI).toFixed(1)} ${H} L${x(known[0][0]).toFixed(1)} ${H} Z`} fill="currentColor" fillOpacity={0.12} />
            <path d={line} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
            <circle cx={x(lastI)} cy={y(lastV)} r={2.4} fill="currentColor" />
        </svg>
    );
}

/** A card's tinted heading: the title, and on the right a legend or a count. */
export function ChartHeading({ title, sub, className }: { title: React.ReactNode; sub?: React.ReactNode; className?: string }) {
    return (
        <div
            className={cn(
                CARD_HEADING_TINT,
                'border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3',
                className,
            )}
        >
            <span className="text-sm font-semibold">{title}</span>
            {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
        </div>
    );
}

/** A card's title with how many it counts beside it ("ตัดจำหน่าย 3 รายการ"). */
export function TitleWithCount({ title, count }: { title: string; count: number }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    return (
        <span className="flex items-baseline gap-2">
            {title}
            <span className="text-muted-foreground text-xs font-normal">{t('rep_chart_items').replace('{n}', formatNumber(count, lang))}</span>
        </span>
    );
}

/** A master-data name in the reader's language — Thai when it has one — else "ไม่มีข้อมูล". */
export function useChartLabel() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (label: ChartLabel | null) => localPair(label?.name ?? null, label?.name_th, lang) || t('rep_no_data');
}

/** Stacked bar with each count over its piece; `scale` is what a full-width bar stands for. */
export function StackBar({ values, series, scale }: { values: Record<string, number>; series: ChartSeries[]; scale: number }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const number = (value: number) => formatNumber(value, lang);
    const width = (value: number) => `${Math.min(100, (value / Math.max(1, scale)) * 100)}%`;

    return (
        <div className="min-w-0">
            <div aria-hidden className="flex h-4 items-end">
                {series.map((s) => {
                    const value = values[s.key] ?? 0;
                    if (value === 0) return null;
                    return (
                        <span
                            key={s.key}
                            className={cn(
                                'flex shrink-0 justify-center overflow-visible text-xs leading-none font-semibold whitespace-nowrap tabular-nums',
                                TEXT[s.tone],
                            )}
                            style={{ width: width(value) }}
                        >
                            {number(value)}
                        </span>
                    );
                })}
            </div>
            <div aria-hidden className="dark:bg-muted mt-1 flex h-3 overflow-hidden rounded-full bg-slate-200">
                {series.map((s) => {
                    const value = values[s.key] ?? 0;
                    if (value === 0) return null;
                    return (
                        <span
                            key={s.key}
                            title={`${t(s.label_key)}: ${number(value)}`}
                            className={cn('block h-full min-w-[3px]', FILL[s.tone])}
                            style={{ width: width(value) }}
                        />
                    );
                })}
            </div>
            <span className="sr-only">
                {series
                    .filter((s) => (values[s.key] ?? 0) > 0)
                    .map((s) => `${t(s.label_key)} ${number(values[s.key])}`)
                    .join(', ')}
            </span>
        </div>
    );
}

/** Past this many months the chart may scroll sideways: it keeps at least SCROLL_MONTH_PX per month. */
export const SCROLL_AFTER_MONTHS = 60;

/** Narrowest width per month once the chart may scroll: a 6px bar and a 2px gap. */
export const SCROLL_MONTH_PX = 8;

/** How the month chart draws itself for this many months (1-6, 7-12, 13-24, more). */
export function monthDensity(months: { month: string }[]) {
    const n = months.length;
    const fromLast = (i: number) => (n - 1 - i) % 2 === 0;
    const janOrFirst = (i: number, month: string) => month.endsWith('-01') || (i === 0 && !months.slice(1, 4).some((m) => m.month.endsWith('-01')));
    if (n <= 6) return { bar: 'max-w-16', gap: 'gap-1 sm:gap-2.5', top: true, pieces: true, thin: false, label: () => true };
    if (n <= 12) return { bar: 'max-w-8', gap: 'gap-1 sm:gap-2.5', top: true, pieces: true, thin: false, label: () => true };
    if (n <= 24) return { bar: 'max-w-5', gap: 'gap-1', top: true, pieces: false, thin: false, label: fromLast };
    return { bar: '', gap: 'gap-0.5', top: false, pieces: false, thin: true, label: janOrFirst };
}

export type MonthDensity = ReturnType<typeof monthDensity>;

/** A month label's place under its bar: centred, or kept inside the chart at either end of a thin run. */
export function monthLabelPlace(density: MonthDensity, i: number, n: number): string {
    if (density.thin && i === 0) return 'left-0 text-left';
    if (density.thin && i === n - 1) return 'right-0 text-right';
    return 'left-1/2 -translate-x-1/2 text-center';
}

/** A bar's top edge (lifted over the count above it) for a note to open from. */
export function barTop(bar: HTMLElement | undefined, lift: number): DOMRect | null {
    if (!bar) return null;
    const box = bar.getBoundingClientRect();
    return new DOMRect(box.left, box.top - lift, box.width, 0);
}

/** This month as "YYYY-MM", the bar a chart marks as still running. */
export const currentMonth = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/** A code that opens its record: the report lists' brand link, with a visible keyboard focus ring. */
export const CODE_LINK =
    'text-brand focus-visible:ring-brand rounded-sm text-xs font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none';

/** The system date setting, bound to a language, for report helpers that run outside a hook. */
export const reportDates = (lang: string) => bindDateFormat(useUiStore.getState().dateConfig, lang);

/** Era-aware 2-digit year of 'YYYY-MM' ("69" under BE), for the small line under a month. */
export function shortYear(month: string, lang: string): string {
    return reportDates(lang)
        .year(Number(month.slice(0, 4)))
        .slice(-2);
}

/** "2026-09" → "ก.ย." ("ก.ย. 26" with `withYear`; "กันยายน 2026" with `long`, for month headings), in the date setting's era. */
export function monthLabel(month: string, lang: 'th' | 'en', withYear: boolean, long = false): string {
    const fmt = reportDates(lang);
    if (long) return fmt.monthYearLong(month);
    return withYear ? `${fmt.month(month)} ${shortYear(month, lang)}` : fmt.month(month);
}

/** Card heading: h2 title, optional note, legend on the right. */
export function CardTitle({
    id,
    title,
    note,
    info,
    sub,
    level: Heading = 'h2',
}: {
    id?: string;
    title: React.ReactNode;
    note?: React.ReactNode;
    /** How the card counts, behind an ⓘ beside the title (read once, not every time); one paragraph each. */
    info?: string | string[];
    sub?: React.ReactNode;
    /** h3 where the card sits under a section heading (Dashboard). */
    level?: 'h2' | 'h3';
}) {
    return (
        <div className={cn(CARD_HEADING_TINT, 'border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3')}>
            <div className="flex flex-wrap items-center gap-x-2">
                <Heading id={id} className="text-sm font-semibold">
                    {title}
                </Heading>
                {info && <InfoMark info={info} />}
                {note && <p className="text-muted-foreground text-xs">{note}</p>}
            </div>
            {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
        </div>
    );
}

/** An ⓘ beside a card's title: how the card counts, one paragraph each, opened by hover, tap or Enter. */
export function InfoMark({ info }: { info: string | string[] }) {
    return (
        <InfoPopover
            label={[info].flat().join(' ')}
            className="text-muted-foreground hover:text-foreground -m-1.5 p-1.5"
            content={
                <div className="max-w-64 space-y-1.5">
                    {[info].flat().map((line) => (
                        <p key={line}>{line}</p>
                    ))}
                </div>
            }
        >
            <Info aria-hidden className="h-3.5 w-3.5" />
        </InfoPopover>
    );
}

/** A legend entry as on the overview's cards: a dot in the mark's colour, then what it means. */
export function Swatch({ fill, children }: { fill: string; children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <i aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', fill)} />
            {children}
        </span>
    );
}

/** A translated sentence with its {slot}s filled: `bold` slots as bold figures, `plain` slots as they are. */
export function rich(template: string, bold: Record<string, React.ReactNode>, plain: Record<string, React.ReactNode> = {}) {
    return template.split(/(\{\w+\})/).map((part, i) => {
        const slot = /^\{(\w+)\}$/.exec(part)?.[1];
        if (slot && slot in bold) {
            return (
                <b key={i} className="text-foreground font-semibold tabular-nums">
                    {bold[slot]}
                </b>
            );
        }
        return <Fragment key={i}>{slot && slot in plain ? plain[slot] : part}</Fragment>;
    });
}

/** A card body with nothing to draw. */
export function CardEmpty({ kind, title, hint }: { kind?: EmptyKind; title: string; hint?: string | null }) {
    return <EmptyState kind={kind} title={title} hint={hint} />;
}

/** One piece of a counted bar: what it is, its colour and its count. */
export interface BarPiece {
    key: string;
    label: string;
    tone: ChartTone;
    value: number;
}

/** Each piece of a counted bar keeps room for its number. */
const PIECE_MIN_PX = 27;

const pieceCount = (n: number, lang: string) => formatNumber(n, lang);

/**
 * A stacked bar with each count inside its piece (as the month chart's pieces). Every piece keeps
 * room for its number; with `scale`, the bar's length is its total against that scale.
 */
export function CountBar({ pieces, scale }: { pieces: BarPiece[]; scale?: number }) {
    const lang = useUiStore((s) => s.lang);
    const shown = pieces.filter((p) => p.value > 0);
    const total = shown.reduce((sum, p) => sum + p.value, 0);
    if (total === 0) return <span className="text-muted-foreground">—</span>;
    const width = scale === undefined ? '100%' : `max(${Math.min(100, (total / Math.max(1, scale)) * 100)}%, ${shown.length * PIECE_MIN_PX}px)`;
    const text = shown.map((p) => `${p.label} ${pieceCount(p.value, lang)}`).join(', ');

    return (
        <InfoPopover
            label={text}
            content={<PieceDetail pieces={shown} />}
            className={cn('block w-full min-w-0 cursor-pointer rounded-full', scale !== undefined && 'dark:bg-muted bg-slate-200')}
        >
            <span aria-hidden className="flex h-5 gap-px overflow-hidden rounded-full" style={{ width }}>
                {shown.map((p) => (
                    <span
                        key={p.key}
                        className={cn(
                            'flex min-w-[26px] items-center justify-center overflow-hidden text-[11px] leading-none font-semibold whitespace-nowrap tabular-nums',
                            FILL[p.tone],
                            PIECE_INK,
                        )}
                        style={{ flex: `${p.value} 1 0` }}
                    >
                        {pieceCount(p.value, lang)}
                    </span>
                ))}
            </span>
        </InfoPopover>
    );
}

/** A bar's popover: each piece with its mark and count. */
export function PieceDetail({ pieces }: { pieces: BarPiece[] }) {
    const lang = useUiStore((s) => s.lang);
    return (
        <div className="space-y-1">
            {pieces.map((p) => (
                <div key={p.key} className="flex items-center justify-between gap-4">
                    <Swatch fill={FILL[p.tone]}>{p.label}</Swatch>
                    <b className="tabular-nums">{pieceCount(p.value, lang)}</b>
                </div>
            ))}
        </div>
    );
}
