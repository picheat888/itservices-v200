/**
 * Filter row of the Ticket & SLA report: date range, categories (multi), priority,
 * department, assignee, clear. Options come from the report payload so the bar never
 * needs another module's permissions.
 */
import { useT } from '@/lang';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import { DateInput } from '@/shared/ui/date-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useUiStore } from '@/stores/ui';
import { ChevronDown } from 'lucide-react';
import type { TicketOverviewSummary, TicketReportFilters } from '../types';
import { FILTER_SELECT_ALL as ALL, FilterSelect } from './filter-select';
import { categoryKey, priorityKey } from './ticket-labels';

const PRIORITIES = ['critical', 'high', 'medium', 'low'];

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
    const toggleCategory = (c: string) =>
        onChange({ categories: filters.categories.includes(c) ? filters.categories.filter((x) => x !== c) : [...filters.categories, c] });

    return (
        <Card className="flex flex-wrap items-end gap-3 p-3">
            <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">{t('rep_f_from')}</span>
                <DateInput id="rep-from" value={filters.from} onChange={(v) => v && onChange({ from: v })} className="w-40" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">{t('rep_f_to')}</span>
                <DateInput id="rep-to" value={filters.to} onChange={(v) => v && onChange({ to: v })} className="w-40" />
            </label>

            <div className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">{t('rep_f_category')}</span>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button id="rep-category" variant="outline" size="sm" className="w-40 justify-between">
                            {filters.categories.length === 0 ? t('rep_f_any') : t('rep_f_n_selected').replace('{n}', String(filters.categories.length))}
                            <ChevronDown className="h-4 w-4 opacity-60" />
                        </Button>
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

            <FilterSelect
                id="rep-priority"
                label={t('rep_f_priority')}
                value={filters.priority || ALL}
                onChange={(v) => onChange({ priority: v === ALL ? '' : v })}
                items={PRIORITIES.map((p) => ({ value: p, label: t(priorityKey(p)) }))}
                anyLabel={t('rep_f_any')}
            />
            <FilterSelect
                id="rep-department"
                label={t('rep_f_department')}
                value={filters.department_id ? String(filters.department_id) : ALL}
                onChange={(v) => onChange({ department_id: v === ALL ? null : Number(v) })}
                items={(options?.departments ?? []).map((d) => ({ value: String(d.id), label: (lang === 'th' && d.name_th) || d.name }))}
                anyLabel={t('rep_f_any')}
            />
            <FilterSelect
                id="rep-assignee"
                label={t('rep_f_assignee')}
                value={filters.assignee_id ? String(filters.assignee_id) : ALL}
                onChange={(v) => onChange({ assignee_id: v === ALL ? null : Number(v) })}
                items={(options?.assignees ?? []).map((a) => ({ value: String(a.id), label: a.name }))}
                anyLabel={t('rep_f_any')}
            />

            <Button variant="ghost" size="sm" onClick={onReset}>
                {t('rep_f_clear')}
            </Button>
        </Card>
    );
}
