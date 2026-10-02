/**
 * The pieces every report filter row is built from, so the Ticket & SLA bar
 * (ticket-report-filter-bar.tsx) and the tabular reports' bar (tabular-filter-bar.tsx) read
 * the same: one line of "name [field]" pairs, a field brand-tinted once it differs from its
 * default, "ทั้งหมด" first with a gray dot, and a gray "ล้างทั้งหมด" badge at the end shown
 * only while something is filtered.
 */
import { useT } from '@/lang';
import type { SearchOption } from '@/shared/components/searchable-select';
import { ToneDot } from '@/shared/components/status-badge';
import { Card } from '@/shared/ui/card';
import { X } from 'lucide-react';
import { FILTER_SELECT_ALL } from './filter-select';

/** A field set away from its default — SearchableSelect's `active` tint, so every field matches. */
export const FILTER_ACTIVE = 'border-brand/50 bg-brand/5 text-brand font-medium';

/** The row itself. */
export function FilterRow({ children }: { children: React.ReactNode }) {
    return <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">{children}</Card>;
}

/** One "name [field]" pair; the name points at the field, so clicking it opens or focuses it. */
export function FilterField({ htmlFor, label, children }: { htmlFor: string; label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2">
            <label htmlFor={htmlFor} className="text-muted-foreground shrink-0 text-sm">
                {label}
            </label>
            {children}
        </div>
    );
}

/** "ทั้งหมด" (gray dot) ahead of a select's own options. */
export function useWithAllOption() {
    const t = useT();
    return (items: SearchOption[]): SearchOption[] => [
        { value: FILTER_SELECT_ALL, label: t('rep_f_any'), search: t('rep_f_any'), icon: <ToneDot tone="gray" /> },
        ...items,
    ];
}

/** The gray clear badge at the row's end — rendered only while `active`. */
export function ClearFiltersBadge({ active, onClear }: { active: boolean; onClear: () => void }) {
    const t = useT();
    if (!active) return null;

    return (
        <button
            type="button"
            onClick={onClear}
            className="bg-muted text-muted-foreground hover:bg-accent hover:text-foreground ml-auto inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors"
        >
            <X className="h-3.5 w-3.5" />
            {t('rep_f_clear')}
        </button>
    );
}
