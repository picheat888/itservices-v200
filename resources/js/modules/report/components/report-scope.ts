// One short line naming a report file's slice ("ก.ย. 2026, กรอง 2 อย่าง, 5 คอลัมน์") for the Report Center rail,
// with the dates shown as the system date setting says.
import { bindDateFormat } from '@/shared/lib/datetime';
import { formatNumber } from '@/shared/lib/number';
import { useUiStore } from '@/stores/ui';
import { narrowedFilterCount } from '../lib/filter-scope';

type Translate = (key: string) => string;

/** The shared short range in the system date setting, kept under its report name for the report's callers. */
export function compactRange(fromValue: string, toValue: string, lang: string): string {
    return bindDateFormat(useUiStore.getState().dateConfig, lang).range(fromValue, toValue);
}

/** A number in the reader's language, for helpers that run outside a component. */
export function formatLiveNumber(value: number): string {
    return formatNumber(value, useUiStore.getState().lang);
}

export function reportScope(filters: Record<string, unknown>, columnsCount: number | null, t: Translate, lang: string): string {
    const parts: string[] = [];
    if (typeof filters.from === 'string' && typeof filters.to === 'string') {
        parts.push(compactRange(filters.from, filters.to, lang));
    } else if (typeof filters.as_of === 'string') {
        parts.push(t('rep_scope_as_of').replace('{date}', bindDateFormat(useUiStore.getState().dateConfig, lang).date(filters.as_of)));
    }

    const narrowed = narrowedFilterCount(filters);
    if (narrowed > 0) parts.push(t('rep_scope_filters').replace('{n}', formatLiveNumber(narrowed)));
    if (columnsCount) parts.push(t('rep_scope_columns').replace('{n}', formatLiveNumber(columnsCount)));

    return parts.length > 0 ? parts.join(', ') : t('rep_scope_all');
}
