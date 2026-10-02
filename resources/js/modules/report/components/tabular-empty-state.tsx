/**
 * What a tabular report's table says when the filters leave no rows: why it is empty (the date
 * range it looked at, or "these filters"), what to try, and buttons that do it — show the last
 * 30 days when the range is shorter than that, or clear the narrowing filters (dates kept).
 * Shown in the DataTable's empty cell by tabular-report-view.tsx; the buttons call the page's
 * filter `patch`, so the URL and the remembered filters follow as for any other change.
 */
import { useT } from '@/lang';
import { Button } from '@/shared/ui/button';
import { useUiStore } from '@/stores/ui';
import { CalendarRange, FilterX, SearchX } from 'lucide-react';
import type { TabularDefinition, TabularFilters } from '../types';
import { compactRange } from './report-scope';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Days from `from` to `to`, both counted; null when either is not a date. */
function spanDays(from: unknown, to: unknown): number | null {
    if (typeof from !== 'string' || typeof to !== 'string') return null;
    const start = Date.parse(from);
    const end = Date.parse(to);
    return Number.isNaN(start) || Number.isNaN(end) ? null : Math.round((end - start) / 86_400_000) + 1;
}

export function TabularEmptyState({
    definition,
    filters,
    onPatch,
}: {
    definition: TabularDefinition;
    filters: TabularFilters;
    onPatch: (next: TabularFilters) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const hasRange = definition.filters.some((f) => f.name === 'from') && definition.filters.some((f) => f.name === 'to');
    const span = hasRange ? spanDays(filters.from, filters.to) : null;
    // Filters other than the dates that are off their default — what "clear filters" resets.
    const narrowing = definition.filters.filter((f) => f.type !== 'date' && (filters[f.name] ?? null) !== f.default);

    const title =
        hasRange && typeof filters.from === 'string' && typeof filters.to === 'string'
            ? t('rep_empty_range').replace('{range}', compactRange(filters.from, filters.to, lang))
            : narrowing.length > 0
              ? t('rep_empty_filtered')
              : t('rep_empty_none');
    const canWiden = span !== null && span < 30;
    const hint =
        narrowing.length > 0 && canWiden
            ? t('rep_empty_hint_both')
            : narrowing.length > 0
              ? t('rep_empty_hint_filters')
              : canWiden
                ? t('rep_empty_hint_range')
                : null;

    const showLast30 = () => {
        const today = new Date();
        onPatch({ from: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)), to: iso(today) });
    };
    const clearNarrowing = () => onPatch(Object.fromEntries(narrowing.map((f) => [f.name, f.default])));

    return (
        <div className="flex flex-col items-center gap-3 py-4">
            <SearchX className="text-muted-foreground/60 h-8 w-8" aria-hidden />
            <div className="space-y-1">
                <p className="text-foreground text-sm font-semibold">{title}</p>
                {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
            </div>
            {(canWiden || narrowing.length > 0) && (
                <div className="flex flex-wrap justify-center gap-2">
                    {canWiden && (
                        <Button variant="outline" size="sm" onClick={showLast30}>
                            <CalendarRange className="h-4 w-4" />
                            {t('rep_empty_last30')}
                        </Button>
                    )}
                    {narrowing.length > 0 && (
                        <Button variant="outline" size="sm" onClick={clearNarrowing}>
                            <FilterX className="h-4 w-4" />
                            {t('rep_empty_clear')}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
