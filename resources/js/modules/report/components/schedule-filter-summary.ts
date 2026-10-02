/**
 * The filters a report file is built with, as "label: value" chips — for ScheduleReportDialog
 * (so whoever sets a schedule sees that "หมวด: ฮาร์ดแวร์" goes out every week, not just that
 * "the page's filters" do) and ExportReportDialog. Only filters that narrow the report are
 * listed; an empty list means the whole report. Dates are left out by default — a schedule
 * rolls them with each send — and put first with `withDates`, since an export keeps them as set.
 *
 * - tabularFilterChips: a generic tabular report, labelled from its own definition.
 * - ticketFilterChips: the Ticket & SLA page, labelled from the ticket enums and the page's
 *   own department / assignee options.
 * Used by pages/tickets-overview.tsx, components/tabular-report-view.tsx and scheduled-reports.tsx.
 */
import type { TabularDefinition, TicketOverviewSummary } from '../types';
import { compactRange } from './report-scope';
import { categoryKey, priorityKey } from './ticket-labels';

type Translate = (key: string) => string;

export interface FilterChip {
    label: string;
    value: string;
}

const isSet = (value: unknown) => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);

/** A localized master-data name: the Thai one when reading Thai and there is one. */
const named = (lang: string, item: { name?: string | null; name_th?: string | null }) => (lang === 'th' && item.name_th) || item.name || '';

/** "ช่วงวันที่: 1 ส.ค. – 2 ต.ค. 2026" from a from/to pair, or the lone date under its own label. */
function dateChips(filters: Record<string, unknown>, t: Translate, lang: string, asOfLabel?: string): FilterChip[] {
    if (typeof filters.from === 'string' && typeof filters.to === 'string') {
        return [{ label: t('rep_f_range'), value: compactRange(filters.from, filters.to, lang) }];
    }
    if (typeof filters.as_of === 'string' && asOfLabel) {
        const [y, m, d] = filters.as_of.split('-').map(Number);
        // One day, written as the ranges are (Gregorian years in both languages).
        const day = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        return [{ label: asOfLabel, value: y && m && d ? day.format(new Date(y, m - 1, d)) : filters.as_of }];
    }
    return [];
}

export function tabularFilterChips(
    definition: TabularDefinition,
    filters: Record<string, unknown>,
    t: Translate,
    lang: string,
    withDates = false,
): FilterChip[] {
    const asOf = definition.filters.find((f) => f.name === 'as_of');
    const dates = withDates ? dateChips(filters, t, lang, asOf ? t(asOf.label_key) : undefined) : [];
    return [...dates, ...narrowing(definition, filters, t, lang)];
}

function narrowing(definition: TabularDefinition, filters: Record<string, unknown>, t: Translate, lang: string): FilterChip[] {
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
    withDates = false,
): FilterChip[] {
    const filters = ticketFilters as Record<string, unknown>;
    const chips: FilterChip[] = withDates ? dateChips(filters, t, lang) : [];
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
