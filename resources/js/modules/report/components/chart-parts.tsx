// Shared report card pieces: list folding, card headings, title with count, master-data label, stacked bar, month label, swatch.
import { useT } from '@/lang';
import { bindDateFormat } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import type { ChartLabel, ChartSeries } from '../types';
import { CARD_HEADING_TINT } from './card-heading';
import { FILL, TEXT } from './chart-tones';
import { InfoPopover } from './info-popover';

/** First `top` rows plus the rest to fold into "อื่น ๆ"; one spare row is shown instead of folding a single name. */
export function fold<T>(rows: T[], top: number, open: boolean, spare = 1) {
    const folds = rows.length > top + spare;
    const folded = folds && !open;

    return { folds, shown: folded ? rows.slice(0, top) : rows, rest: folded ? rows.slice(top) : [] };
}

/** "แสดงทั้งหมด (24)" / "ย่อ" under a folding list. */
export function FoldToggle({ open, total, onToggle }: { open: boolean; total: number; onToggle: () => void }) {
    const t = useT();
    const Icon = open ? ChevronUp : ChevronDown;

    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring mt-auto flex w-full items-center justify-center gap-1.5 border-t py-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        >
            <Icon aria-hidden className="h-3.5 w-3.5" />
            {open ? t('rep_chart_show_less') : t('rep_chart_show_all').replace('{n}', String(total))}
        </button>
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

    return (
        <span className="flex items-baseline gap-2">
            {title}
            <span className="text-muted-foreground text-xs font-normal">{t('rep_chart_items').replace('{n}', count.toLocaleString())}</span>
        </span>
    );
}

/** A master-data name in the reader's language — Thai when it has one — else "ไม่มีข้อมูล". */
export function useChartLabel() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (label: ChartLabel | null) => (label && ((lang === 'th' && label.name_th) || label.name)) || t('rep_no_data');
}

/** Stacked bar with each count over its piece; `scale` is what a full-width bar stands for. */
export function StackBar({ values, series, scale }: { values: Record<string, number>; series: ChartSeries[]; scale: number }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const number = (value: number) => value.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US');
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
                                'flex shrink-0 justify-center overflow-visible font-mono text-xs leading-none font-semibold whitespace-nowrap tabular-nums',
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
    'text-brand focus-visible:ring-brand rounded-sm font-mono text-xs font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none';

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
}: {
    id?: string;
    title: React.ReactNode;
    note?: React.ReactNode;
    /** How the card counts, behind an ⓘ beside the title (read once, not every time); one paragraph each. */
    info?: string | string[];
    sub?: React.ReactNode;
}) {
    return (
        <div className={cn(CARD_HEADING_TINT, 'border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3')}>
            <div className="flex flex-wrap items-center gap-x-2">
                <h2 id={id} className="text-sm font-semibold">
                    {title}
                </h2>
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
            className="text-muted-foreground hover:text-foreground -m-1 p-1"
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

/** A card body with nothing to draw. */
export function CardEmpty({ children }: { children: React.ReactNode }) {
    return <div className="text-muted-foreground flex flex-1 items-center justify-center px-5 py-10 text-center text-sm">{children}</div>;
}
