/**
 * The filters a scheduled email will keep, as "label: value" chips for ScheduleReportDialog —
 * so whoever sets a schedule sees that "หมวด: ฮาร์ดแวร์" goes out every week, not just that
 * "the page's filters" do. Dates are left out: they roll with each send. Only filters that
 * narrow the report are listed; an empty list means the whole report.
 *
 * - tabularFilterChips: a generic tabular report, labelled from its own definition.
 * - ticketFilterChips: the Ticket & SLA page, labelled from the ticket enums and the page's
 *   own department / assignee options.
 * Used by pages/ticket-overview.tsx, pages/tabular-report.tsx and scheduled-reports.tsx.
 */
import type { TabularDefinition, TicketOverviewSummary } from '../types';
import { categoryKey, priorityKey } from './ticket-labels';

type Translate = (key: string) => string;

export interface FilterChip {
    label: string;
    value: string;
}

const isSet = (value: unknown) => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);

/** A localized master-data name: the Thai one when reading Thai and there is one. */
const named = (lang: string, item: { name?: string | null; name_th?: string | null }) => (lang === 'th' && item.name_th) || item.name || '';

export function tabularFilterChips(definition: TabularDefinition, filters: Record<string, unknown>, t: Translate, lang: string): FilterChip[] {
    return definition.filters
        .filter((f) => f.type !== 'date' && isSet(filters[f.name]))
        .map((f) => {
            const raw = filters[f.name];
            const option = f.options.find((o) => String(o.value) === String(raw));
            const value = option
                ? option.label_key
                    ? t(option.label_key)
                    : (lang === 'th' && option.label_th) || option.label || String(raw)
                : String(raw);
            return { label: t(f.label_key), value };
        });
}

export function ticketFilterChips(
    ticketFilters: object,
    options: TicketOverviewSummary['options'] | undefined,
    t: Translate,
    lang: string,
): FilterChip[] {
    const filters = ticketFilters as Record<string, unknown>;
    const chips: FilterChip[] = [];
    const categories = Array.isArray(filters.categories) ? (filters.categories as string[]) : [];
    if (categories.length > 0) {
        chips.push({ label: t('rep_f_category'), value: categories.map((c) => t(categoryKey(c))).join(', ') });
    }
    if (isSet(filters.priority)) {
        chips.push({ label: t('rep_f_priority'), value: t(priorityKey(String(filters.priority))) });
    }
    if (isSet(filters.department_id)) {
        const department = options?.departments.find((d) => d.id === Number(filters.department_id));
        chips.push({ label: t('rep_f_department'), value: department ? named(lang, department) : `#${filters.department_id}` });
    }
    if (isSet(filters.assignee_id)) {
        const assignee = options?.assignees.find((a) => a.id === Number(filters.assignee_id));
        chips.push({ label: t('rep_f_assignee'), value: assignee?.name ?? `#${filters.assignee_id}` });
    }
    return chips;
}
