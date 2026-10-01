/**
 * Filter row of the Ticket & SLA report, in one line: date range, categories (multi), priority,
 * department, assignee, clear. Each field names itself inside its trigger ("แผนก  ทั้งหมด") and
 * turns brand-tinted once it differs from the default — the field look of the app's Filter
 * popover (SearchableSelect `active`, gray dot for "all"), laid out as a row. Options come from
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
import { CalendarRange, ChevronsUpDown, X } from 'lucide-react';
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

/** The trigger look shared by every field in the row (SearchableSelect's, so they match). */
const fieldClass = (active: boolean) =>
    cn(
        'flex h-10 items-center gap-2 rounded-md border px-3 text-sm transition-colors',
        active ? 'border-brand/50 bg-brand/5 text-brand font-medium' : 'border-input bg-background hover:border-brand/50',
    );

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
        <Card className="flex flex-wrap items-center gap-2 p-3">
            {/* One field for the range: both ends sit inside a single tinted box. */}
            <div className={cn(fieldClass(rangeSet), 'gap-1 pr-1')}>
                <CalendarRange className={cn('h-4 w-4 shrink-0', !rangeSet && 'text-muted-foreground')} />
                <span className="text-muted-foreground mr-1 font-normal">{t('rep_f_range')}</span>
                <DateInput
                    id="rep-from"
                    value={filters.from}
                    onChange={(v) => v && onChange({ from: v })}
                    className="h-8 w-auto border-0 bg-transparent px-1.5 [&>svg]:hidden"
                />
                <span className="text-muted-foreground">–</span>
                <DateInput
                    id="rep-to"
                    value={filters.to}
                    onChange={(v) => v && onChange({ to: v })}
                    className="h-8 w-auto border-0 bg-transparent px-1.5 [&>svg]:hidden"
                />
            </div>

            <Popover>
                <PopoverTrigger asChild>
                    <button id="rep-category" type="button" className={cn(fieldClass(filters.categories.length > 0), 'w-44 justify-between')}>
                        <span className="flex min-w-0 items-center gap-2">
                            <span className="text-muted-foreground shrink-0 font-normal">{t('rep_f_category')}</span>
                            <span className="truncate">
                                {filters.categories.length === 0
                                    ? t('rep_f_any')
                                    : t('rep_f_n_selected').replace('{n}', String(filters.categories.length))}
                            </span>
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

            <div className="w-48">
                <SearchableSelect
                    id="rep-priority"
                    prefix={t('rep_f_priority')}
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
            <div className="w-56">
                <SearchableSelect
                    id="rep-department"
                    prefix={t('rep_f_department')}
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
            <div className="w-60">
                <SearchableSelect
                    id="rep-assignee"
                    prefix={t('rep_f_assignee')}
                    active={!!filters.assignee_id}
                    value={filters.assignee_id ? String(filters.assignee_id) : ALL}
                    onChange={(v) => onChange({ assignee_id: v === ALL ? null : Number(v) })}
                    options={withAll((options?.assignees ?? []).map((a) => ({ value: String(a.id), label: a.name, search: a.name })))}
                />
            </div>

            <button
                type="button"
                onClick={onReset}
                disabled={activeCount === 0}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-10 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
            >
                <X className="h-3.5 w-3.5" />
                {t('rep_f_clear')}
                {activeCount > 0 && (
                    <span className="bg-brand/10 text-brand flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[11px] font-bold">
                        {activeCount}
                    </span>
                )}
            </button>
        </Card>
    );
}
