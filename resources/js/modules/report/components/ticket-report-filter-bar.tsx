/**
 * Filter row of the Ticket & SLA report, in one line of "name [field]" pairs: date range
 * (from ถึง to), categories (multi), priority, department, assignee. A field turns brand-tinted
 * once it differs from the default — the field look of the app's Filter popover
 * (SearchableSelect `active`, gray dot for "all"). "ล้างทั้งหมด" is a gray badge at the end,
 * shown only while something is filtered — all from filter-row.tsx, shared with the tabular
 * reports' bar. Options come from the report payload so the bar never needs another module's
 * permissions.
 */
import { useT } from '@/lang';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { ToneDot } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { Checkbox } from '@/shared/ui/checkbox';
import { DateInput } from '@/shared/ui/date-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useUiStore } from '@/stores/ui';
import { ChevronsUpDown } from 'lucide-react';
import { defaultTicketReportFilters, TICKET_SOURCES } from '../hooks/use-ticket-report-filters';
import type { TicketOverviewSummary, TicketReportFilters } from '../types';
import { ClearFiltersBadge, FILTER_ACTIVE, FilterField, FilterRow, useWithAllOption } from './filter-row';
import { FILTER_SELECT_ALL as ALL } from './filter-select';
import { categoryKey, priorityKey } from './ticket-labels';

const PRIORITIES = [
    { value: 'critical', tone: 'red' },
    { value: 'high', tone: 'amber' },
    { value: 'medium', tone: 'blue' },
    { value: 'low', tone: 'gray' },
] as const;

export function TicketReportFilterBar({
    filters,
    options,
    onChange,
    onReset,
}: {
    filters: TicketReportFilters;
    options?: TicketOverviewSummary['options'];
    onChange: (next: Partial<TicketReportFilters>) => void;
    onReset: () => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const defaults = defaultTicketReportFilters();
    const toggleCategory = (c: string) =>
        onChange({ categories: filters.categories.includes(c) ? filters.categories.filter((x) => x !== c) : [...filters.categories, c] });

    const rangeSet = filters.from !== defaults.from || filters.to !== defaults.to;
    const activeCount =
        (rangeSet ? 1 : 0) +
        (filters.categories.length > 0 ? 1 : 0) +
        (filters.priority ? 1 : 0) +
        (filters.department_id ? 1 : 0) +
        (filters.assignee_id ? 1 : 0) +
        (filters.source ? 1 : 0);

    const withAll = useWithAllOption();

    return (
        <FilterRow>
            <div className="flex items-center gap-2">
                <label htmlFor="rep-from" className="text-muted-foreground shrink-0 text-sm">
                    {t('rep_f_range')}
                </label>
                <DateInput
                    id="rep-from"
                    value={filters.from}
                    onChange={(v) => v && onChange({ from: v })}
                    className={cn('w-36', rangeSet && FILTER_ACTIVE)}
                />
                <label htmlFor="rep-to" className="text-muted-foreground shrink-0 text-sm">
                    {t('rep_f_to')}
                </label>
                <DateInput
                    id="rep-to"
                    value={filters.to}
                    onChange={(v) => v && onChange({ to: v })}
                    className={cn('w-36', rangeSet && FILTER_ACTIVE)}
                />
            </div>

            <FilterField htmlFor="rep-category" label={t('rep_f_category')}>
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            id="rep-category"
                            type="button"
                            className={cn(
                                'flex h-10 w-36 items-center justify-between gap-2 rounded-md border px-3 text-sm transition-colors',
                                filters.categories.length > 0 ? FILTER_ACTIVE : 'border-input bg-background hover:border-brand/50',
                            )}
                        >
                            <span className="truncate">
                                {filters.categories.length === 0
                                    ? t('rep_f_any')
                                    : t('rep_f_n_selected').replace('{n}', String(filters.categories.length))}
                            </span>
                            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 space-y-1 p-2" align="start">
                        {(options?.categories ?? []).map((c) => (
                            <label key={c} className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm">
                                <Checkbox checked={filters.categories.includes(c)} onCheckedChange={() => toggleCategory(c)} />
                                {t(categoryKey(c))}
                            </label>
                        ))}
                    </PopoverContent>
                </Popover>
            </FilterField>

            <FilterField htmlFor="rep-priority" label={t('rep_f_priority')}>
                <div className="w-36">
                    <SearchableSelect
                        id="rep-priority"
                        active={!!filters.priority}
                        value={filters.priority || ALL}
                        onChange={(v) => onChange({ priority: v === ALL ? '' : v })}
                        options={withAll(
                            PRIORITIES.map((p) => ({
                                value: p.value,
                                label: t(priorityKey(p.value)),
                                search: t(priorityKey(p.value)),
                                icon: <ToneDot tone={p.tone} />,
                            })),
                        )}
                    />
                </div>
            </FilterField>

            <FilterField htmlFor="rep-department" label={t('rep_f_department')}>
                <div className="w-48">
                    <SearchableSelect
                        id="rep-department"
                        active={!!filters.department_id}
                        value={filters.department_id ? String(filters.department_id) : ALL}
                        onChange={(v) => onChange({ department_id: v === ALL ? null : Number(v) })}
                        options={withAll(
                            (options?.departments ?? []).map((d) => {
                                const label = (lang === 'th' && d.name_th) || d.name;
                                // Departments store mixed TH/EN names — search both.
                                return { value: String(d.id), label, search: `${d.name} ${d.name_th ?? ''}` };
                            }),
                        )}
                    />
                </div>
            </FilterField>

            <FilterField htmlFor="rep-assignee" label={t('rep_f_assignee')}>
                <div className="w-48">
                    <SearchableSelect
                        id="rep-assignee"
                        active={!!filters.assignee_id}
                        value={filters.assignee_id ? String(filters.assignee_id) : ALL}
                        onChange={(v) => onChange({ assignee_id: v === ALL ? null : Number(v) })}
                        options={withAll((options?.assignees ?? []).map((a) => ({ value: String(a.id), label: a.name, search: a.name })))}
                    />
                </div>
            </FilterField>

            {/* Who opened the ticket: a person, or an approved request (tickets.source). */}
            <FilterField htmlFor="rep-source" label={t('rep_fl_source')}>
                <div className="w-48">
                    <SearchableSelect
                        id="rep-source"
                        active={!!filters.source}
                        value={filters.source || ALL}
                        onChange={(v) => onChange({ source: v === ALL ? '' : v })}
                        options={withAll(TICKET_SOURCES.map((s) => ({ value: s, label: t(`rep_source_${s}`), search: t(`rep_source_${s}`) })))}
                    />
                </div>
            </FilterField>

            <ClearFiltersBadge active={activeCount > 0} onClear={onReset} />
        </FilterRow>
    );
}
