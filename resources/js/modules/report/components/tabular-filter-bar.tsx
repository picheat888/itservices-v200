/**
 * Filter row of a generic tabular report: one field per `TabularFilterDef` (select, date
 * or debounced search) plus a clear-all button. Options and labels come from the report's
 * own definition, so the bar never needs another module's permissions — mirrors
 * `ticket-report-filter-bar.tsx`, generalized to whatever filters a report declares.
 */
import { useT } from '@/lang';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { DateInput } from '@/shared/ui/date-input';
import { Input } from '@/shared/ui/input';
import { useUiStore } from '@/stores/ui';
import { useEffect, useState } from 'react';
import type { TabularDefinition, TabularFilters } from '../types';
import { FILTER_SELECT_ALL as ALL, FilterSelect } from './filter-select';

function optionLabel(t: (key: string) => string, lang: 'en' | 'th', option: { label?: string; label_th?: string | null; label_key?: string }): string {
    if (option.label_key) return t(option.label_key);
    return (lang === 'th' && option.label_th) || option.label || '';
}

function SearchField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
    const [draft, setDraft] = useState(value);

    // Keep the field in sync when the filters are reset (or seeded) from outside.
    useEffect(() => setDraft(value), [value]);

    // Debounce 300ms so typing does not fire a request per keystroke.
    useEffect(() => {
        const id = window.setTimeout(() => {
            if (draft !== value) onChange(draft);
        }, 300);
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft]);

    return (
        <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <Input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} className="h-9 w-44" />
        </label>
    );
}

export function TabularFilterBar({
    definition,
    filters,
    onChange,
    onReset,
}: {
    definition: TabularDefinition;
    filters: TabularFilters;
    onChange: (next: TabularFilters) => void;
    onReset: () => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    return (
        <Card className="flex flex-wrap items-end gap-3 p-3">
            {definition.filters.map((filter) => {
                const label = t(filter.label_key);
                const value = filters[filter.name];

                if (filter.type === 'select') {
                    return (
                        <FilterSelect
                            key={filter.name}
                            id={`rep-fl-${filter.name}`}
                            label={label}
                            value={value === null || value === undefined || value === '' ? ALL : String(value)}
                            onChange={(v) => onChange({ [filter.name]: v === ALL ? null : v })}
                            items={filter.options.map((o) => ({ value: String(o.value), label: optionLabel(t, lang, o) }))}
                            anyLabel={t('rep_f_any')}
                        />
                    );
                }

                if (filter.type === 'date') {
                    return (
                        <label key={filter.name} className="flex flex-col gap-1 text-xs">
                            <span className="text-muted-foreground">{label}</span>
                            <DateInput
                                id={`rep-fl-${filter.name}`}
                                value={value ? String(value) : ''}
                                onChange={(v) => onChange({ [filter.name]: v || null })}
                                className="w-40"
                            />
                        </label>
                    );
                }

                return (
                    <SearchField
                        key={filter.name}
                        id={`rep-fl-${filter.name}`}
                        label={label}
                        value={value ? String(value) : ''}
                        onChange={(v) => onChange({ [filter.name]: v || null })}
                    />
                );
            })}

            <Button variant="ghost" size="sm" onClick={onReset}>
                {t('rep_f_clear')}
            </Button>
        </Card>
    );
}
