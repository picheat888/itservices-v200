// Shared report card pieces: list folding, card headings, title with count, master-data label, stacked bar, month label, swatch.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ChartLabel, ChartSeries } from '../types';
import { CARD_HEADING_TINT } from './card-heading';
import { FILL, TEXT } from './chart-tones';

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
                                'flex shrink-0 justify-center overflow-visible font-mono text-xs leading-none font-semibold whitespace-nowrap',
                                TEXT[s.tone],
                            )}
                            style={{ width: width(value) }}
                        >
                            {value}
                        </span>
                    );
                })}
            </div>
            <div aria-hidden className="bg-muted mt-1 flex h-3 overflow-hidden rounded-full">
                {series.map((s) => {
                    const value = values[s.key] ?? 0;
                    if (value === 0) return null;
                    return (
                        <span
                            key={s.key}
                            title={`${t(s.label_key)}: ${value}`}
                            className={cn('block h-full min-w-[3px]', FILL[s.tone])}
                            style={{ width: width(value) }}
                        />
                    );
                })}
            </div>
            <span className="sr-only">
                {series
                    .filter((s) => (values[s.key] ?? 0) > 0)
                    .map((s) => `${t(s.label_key)} ${values[s.key]}`)
                    .join(', ')}
            </span>
        </div>
    );
}

/** "2026-09" → "ก.ย." (with "26" on the first column and each January when `withYear`). */
export function monthLabel(month: string, lang: 'th' | 'en', withYear: boolean, long = false): string {
    const [y, m] = month.split('-').map(Number);
    const name = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { month: long ? 'long' : 'short' }).format(
        new Date(y, m - 1, 1),
    );
    if (long) return `${name} ${y}`;
    return withYear ? `${name} ${String(y).slice(2)}` : name;
}

/** Card heading: h2 title, optional note, legend on the right. */
export function CardTitle({ id, title, note, sub }: { id?: string; title: React.ReactNode; note?: React.ReactNode; sub?: React.ReactNode }) {
    return (
        <div className={cn(CARD_HEADING_TINT, 'border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3')}>
            <div className="flex flex-wrap items-baseline gap-x-2">
                <h2 id={id} className="text-sm font-semibold">
                    {title}
                </h2>
                {note && <p className="text-muted-foreground text-xs">{note}</p>}
            </div>
            {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
        </div>
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
    return <div className="text-muted-foreground px-5 py-10 text-center text-sm">{children}</div>;
}
