/**
 * Filter row of the Ticket & SLA report, in one line of "name [field]" pairs: date range
 * (from ถึง to), categories (multi), priority, department, assignee. A field turns brand-tinted
 * once it differs from the default — the field look of the app's Filter popover
 * (SearchableSelect `active`, gray dot for "all"). "ล้างทั้งหมด" is a gray badge at the end,
 * shown only while something is filtered. Options come from
 * the report payload so the bar never needs another module's permissions.
 */
import { useT } from '@/lang';
import { SearchableSelect, type SearchOption } from '@/shared/components/searchable-select';
import { ToneDot } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import { DateInput } from '@/shared/ui/date-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useUiStore } from '@/stores/ui';
import { ChevronsUpDown, X } from 'lucide-react';
import { defaultTicketReportFilters } from '../hooks/use-ticket-report-filters';
import type { TicketOverviewSummary, TicketReportFilters } from '../types';
import { FILTER_SELECT_ALL as ALL } from './filter-select';
import { categoryKey, priorityKey } from './ticket-labels';

const PRIORITIES = [
    { value: 'critical', tone: 'red' },
    { value: 'high', tone: 'amber' },
    { value: 'medium', tone: 'blue' },
    { value: 'low', tone: 'gray' },
] as const;

/** A field set away from its default — SearchableSelect's `active` tint, so every field matches. */
const ACTIVE = 'border-brand/50 bg-brand/5 text-brand font-medium';

/** The name before each field. */
const labelClass = 'text-muted-foreground shrink-0 text-sm';

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
        (filters.assignee_id ? 1 : 0);

    // "ทั้งหมด" first with a gray dot, as in the Filter popovers.
    const withAll = (items: SearchOption[]): SearchOption[] => [
        { value: ALL, label: t('rep_f_any'), search: t('rep_f_any'), icon: <ToneDot tone="gray" /> },
        ...items,
    ];

    return (
        <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
            <div className="flex items-center gap-2">
                <label htmlFor="rep-from" className={labelClass}>
                    {t('rep_f_range')}
                </label>
                <DateInput
                    id="rep-from"
                    value={filters.from}
                    onChange={(v) => v && onChange({ from: v })}
                    className={cn('w-36', rangeSet && ACTIVE)}
                />
                <label htmlFor="rep-to" className={labelClass}>
                    {t('rep_f_to')}
                </label>
                <DateInput id="rep-to" value={filters.to} onChange={(v) => v && onChange({ to: v })} className={cn('w-36', rangeSet && ACTIVE)} />
            </div>

            <div className="flex items-center gap-2">
                <label htmlFor="rep-category" className={labelClass}>
                    {t('rep_f_category')}
                </label>
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            id="rep-category"
                            type="button"
                            className={cn(
                                'flex h-10 w-36 items-center justify-between gap-2 rounded-md border px-3 text-sm transition-colors',
                                filters.categories.length > 0 ? ACTIVE : 'border-input bg-background hover:border-brand/50',
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
            </div>

            <div className="flex items-center gap-2">
                <label htmlFor="rep-priority" className={labelClass}>
                    {t('rep_f_priority')}
                </label>
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
            </div>

            <div className="flex items-center gap-2">
                <label htmlFor="rep-department" className={labelClass}>
                    {t('rep_f_department')}
                </label>
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
            </div>

            <div className="flex items-center gap-2">
                <label htmlFor="rep-assignee" className={labelClass}>
                    {t('rep_f_assignee')}
                </label>
                <div className="w-48">
                    <SearchableSelect
                        id="rep-assignee"
                        active={!!filters.assignee_id}
                        value={filters.assignee_id ? String(filters.assignee_id) : ALL}
                        onChange={(v) => onChange({ assignee_id: v === ALL ? null : Number(v) })}
                        options={withAll((options?.assignees ?? []).map((a) => ({ value: String(a.id), label: a.name, search: a.name })))}
                    />
                </div>
            </div>

            {/* A gray badge at the row's end, there only while something is filtered. */}
            {activeCount > 0 && (
                <button
                    type="button"
                    onClick={onReset}
                    className="bg-muted text-muted-foreground hover:bg-accent hover:text-foreground ml-auto inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors"
                >
                    <X className="h-3.5 w-3.5" />
                    {t('rep_f_clear')}
                </button>
            )}
        </Card>
    );
}
