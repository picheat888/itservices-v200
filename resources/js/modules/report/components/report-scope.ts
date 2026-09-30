/**
 * One short line saying which slice of a report a file or a schedule holds — "2026-09-01 –
 * 2026-09-30 · 2 filters · 5 columns" — built from the filters it was made with. Used by the
 * Report Center rail (my-exports.tsx) so two files of the same report can be told apart.
 */
type Translate = (key: string) => string;

const DATE_KEYS = new Set(['from', 'to', 'as_of']);

const isSet = (value: unknown) => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);

export function reportScope(filters: Record<string, unknown>, columnsCount: number | null, t: Translate): string {
    const parts: string[] = [];
    if (typeof filters.from === 'string' && typeof filters.to === 'string') {
        parts.push(`${filters.from} – ${filters.to}`);
    } else if (typeof filters.as_of === 'string') {
        parts.push(t('rep_scope_as_of').replace('{date}', filters.as_of));
    }

    const narrowed = Object.entries(filters).filter(([key, value]) => !DATE_KEYS.has(key) && isSet(value)).length;
    if (narrowed > 0) parts.push(t('rep_scope_filters').replace('{n}', String(narrowed)));
    if (columnsCount) parts.push(t('rep_scope_columns').replace('{n}', String(columnsCount)));

    return parts.length > 0 ? parts.join(' · ') : t('rep_scope_all');
}
