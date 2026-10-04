/**
 * Small pieces every report card shares: the card heading, a master-data name in the reader's
 * language, and folding a long list ("อื่น ๆ (n)" with "แสดงทั้งหมด (n)" under it).
 * Used by tabular-charts.tsx, its cards (bucket-rows-card, compact-stacks-card, asset-list-card)
 * and the Ticket pages' cards (backlog-board, ticket-breakdown-cards).
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ChartLabel } from '../types';
import { CARD_HEADING_TINT } from './card-heading';

/**
 * The rows a list shows: all of them, or — past `top` and while not `open` — the first `top`
 * with the rest handed back to be summed into one "อื่น ๆ" row. By default one extra row is shown
 * rather than folded, since "อื่น ๆ (1)" would only hide a name; `spare: 0` folds at exactly `top`.
 */
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
            className="border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground mt-auto flex w-full items-center justify-center gap-1.5 border-t py-2.5 text-xs font-medium transition-colors"
        >
            <Icon className="h-3.5 w-3.5" />
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

/** A master-data name in the reader's language — Thai when it has one — else "ไม่มีข้อมูล". */
export function useChartLabel() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (label: ChartLabel | null) => (label && ((lang === 'th' && label.name_th) || label.name)) || t('rep_no_data');
}
