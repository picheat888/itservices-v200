/**
 * Filter row of a generic tabular report: one "name [field]" pair per `TabularFilterDef`
 * (select, date or debounced search), built from filter-row.tsx so it reads like the Ticket &
 * SLA bar — a from/to pair is one date-range field, selects are w-36 (fixed lists) or w-40
 * (master data), a field turns brand-tinted once it differs from the report's default, and the gray
 * "ล้างทั้งหมด" badge shows only while something differs. Options and labels come from the
 * report's own definition, so the bar never needs another module's permissions.
 */
import { useT } from '@/lang';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { cn } from '@/shared/lib/utils';
import { DateInput } from '@/shared/ui/date-input';
import { DateRangeInput } from '@/shared/ui/date-range-input';
import { Input } from '@/shared/ui/input';
import { useUiStore } from '@/stores/ui';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TabularDefinition, TabularFilterDef, TabularFilters } from '../types';
import { ClearFiltersBadge, FILTER_ACTIVE, FilterField, FilterRow, useWithAllOption } from './filter-row';
import { FILTER_SELECT_ALL as ALL } from './filter-select';

function optionLabel(
    t: (key: string) => string,
    lang: 'en' | 'th',
    option: { label?: string; label_th?: string | null; label_key?: string },
): string {
    if (option.label_key) return t(option.label_key);
    return (lang === 'th' && option.label_th) || option.label || '';
}

/** null, '' and undefined all mean "not set". */
const normalize = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? null : String(v));

/** True when the filter's value is not the report's default — what tints the field. */
const differs = (filter: TabularFilterDef, filters: TabularFilters) => normalize(filters[filter.name]) !== normalize(filter.default);

function SearchField({ id, value, active, onChange }: { id: string; value: string; active: boolean; onChange: (v: string) => void }) {
    const [draft, setDraft] = useState(value);

    // Keep the field in sync when the filters are reset (or seeded) from outside.
    useEffect(() => setDraft(value), [value]);

    // Debounce 300ms so typing does not fire a request per keystroke.
    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (draft !== value) onChange(draft);
        }, 300);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft]);

    return (
        <div className="relative w-48">
            <Search
                aria-hidden="true"
                className={cn(
                    'pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2',
                    active ? 'text-brand' : 'text-muted-foreground',
                )}
            />
            <Input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} className={cn('pl-9', active && FILTER_ACTIVE)} />
        </div>
    );
}

export function TabularFilterBar({
    definition,
    filters,
    onChange,
    onReset,
    hidden = [],
    viewOnly = [],
    leading,
}: {
    definition: TabularDefinition;
    filters: TabularFilters;
    onChange: (next: TabularFilters) => void;
    onReset: () => void;
    /** Filters the page draws itself (e.g. the backlog's SLA segments) — left out of the bar. */
    hidden?: string[];
    /** Filters that only set how the page is shown — left out of the clear badge. */
    viewOnly?: string[];
    /** Drawn first in the bar. */
    leading?: React.ReactNode;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const withAll = useWithAllOption();
    const anySet = definition.filters.some((filter) => !viewOnly.includes(filter.name) && differs(filter, filters));
    const shown = (name: string) => definition.filters.find((f) => f.name === name && f.type === 'date' && !hidden.includes(name));
    const rangeFrom = shown('from');
    const rangeTo = shown('to');
    const range = rangeFrom && rangeTo ? { from: rangeFrom, to: rangeTo } : null;

    return (
        <FilterRow>
            {leading}
            {definition.filters
                .filter((filter) => !hidden.includes(filter.name))
                .map((filter) => {
                    const id = `rep-fl-${filter.name}`;
                    const label = t(filter.label_key);
                    const value = filters[filter.name];
                    const active = differs(filter, filters);

                    // A from/to pair is one field, as on the Ticket & SLA page: drawn at "from", skipped at "to".
                    if (range && filter.name === 'to') return null;
                    if (range && filter.name === 'from') {
                        return (
                            <FilterField key="range" htmlFor="rep-fl-range" label={t('rep_f_range')}>
                                <DateRangeInput
                                    id="rep-fl-range"
                                    from={String(filters.from ?? range.from.default ?? '')}
                                    to={String(filters.to ?? range.to.default ?? '')}
                                    onChange={(from, to) => onChange({ from, to })}
                                    className={cn('min-w-40', (active || differs(range.to, filters)) && FILTER_ACTIVE)}
                                />
                            </FilterField>
                        );
                    }

                    if (filter.type === 'select') {
                        // Widths as on the Ticket & SLA page: short fixed lists w-36, master data (names) w-40.
                        const fixedList = filter.options.every((o) => o.label_key);
                        return (
                            <FilterField key={filter.name} htmlFor={id} label={label}>
                                <div className={fixedList ? 'w-36' : 'w-40'}>
                                    <SearchableSelect
                                        id={id}
                                        active={active}
                                        value={normalize(value) ?? ALL}
                                        onChange={(v) => onChange({ [filter.name]: v === ALL ? null : v })}
                                        options={withAll(
                                            filter.options.map((o) => {
                                                const text = optionLabel(t, lang, o);
                                                // Master data stores mixed TH/EN names — search both.
                                                return {
                                                    value: String(o.value),
                                                    label: text,
                                                    hint: o.hint ?? undefined,
                                                    search: `${text} ${o.label ?? ''} ${o.label_th ?? ''} ${o.hint ?? ''}`,
                                                };
                                            }),
                                        )}
                                    />
                                </div>
                            </FilterField>
                        );
                    }

                    if (filter.type === 'date') {
                        return (
                            <FilterField key={filter.name} htmlFor={id} label={label}>
                                <DateInput
                                    id={id}
                                    value={value ? String(value) : ''}
                                    onChange={(v) => onChange({ [filter.name]: v || null })}
                                    className={cn('w-40', active && FILTER_ACTIVE)}
                                />
                            </FilterField>
                        );
                    }

                    return (
                        <FilterField key={filter.name} htmlFor={id} label={label}>
                            <SearchField
                                id={id}
                                value={value ? String(value) : ''}
                                active={active}
                                onChange={(v) => onChange({ [filter.name]: v || null })}
                            />
                        </FilterField>
                    );
                })}

            <ClearFiltersBadge active={anySet} onClear={onReset} />
        </FilterRow>
    );
}
