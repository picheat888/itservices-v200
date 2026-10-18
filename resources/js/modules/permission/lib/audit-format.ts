// Readable audit-log diffs: raw column names become labels and older foreign-key ids become names, at display time.

import { translate } from '@/lang';
import { isDateString, storedDateText, type DateFormatter } from '@/shared/lib/datetime';
import { formatNumber } from '@/shared/lib/number';
import type { Lang } from '@/shared/types';
import { auditBooleanKey, auditValueKey, decimalPlaces, isBlankAuditValue } from './audit-details';
import { auditFieldText } from './audit-words';

/** A column's label (audit_field_<column>, owner by subject type), or the raw column name when it has none. */
export function auditFieldLabel(field: string, lang: Lang, subjectType?: string | null): string {
    return auditFieldText(field, (key) => translate(lang, key), subjectType);
}

/** Reference maps (id → display name) used to resolve foreign-key ids in diffs. */
export interface AuditLookups {
    positions: Map<number, string>;
    departments: Map<number, string>;
    sections: Map<number, string>;
    employees: Map<number, string>;
}

/** Which diff fields are foreign-key ids, and the lookup that resolves each. */
const FK_FIELDS: Record<string, keyof AuditLookups> = {
    position_id: 'positions',
    department_id: 'departments',
    section_id: 'sections',
    manager_id: 'employees',
};

/** A foreign-key id as the entity's name (`#<id>` when it is gone); any other value unchanged. */
export function resolveAuditValue(field: string, value: unknown, lookups: AuditLookups): unknown {
    const lookupKey = FK_FIELDS[field];
    if (!lookupKey || value === null || value === undefined || value === '') {
        return value;
    }
    const id = Number(value);
    if (!Number.isFinite(id)) {
        return value;
    }
    return lookups[lookupKey].get(id) ?? `#${id}`;
}

/** A stored value as the reader sees it: a name, a date in the date setting, yes/no, a module word, a grouped decimal; null when blank. */
export function auditValueText(
    field: string,
    value: unknown,
    ctx: { subjectType: string | null | undefined; lookups: AuditLookups; lang: Lang; fmt: DateFormatter },
): string | null {
    const resolved = resolveAuditValue(field, value, ctx.lookups);
    if (isBlankAuditValue(resolved)) return null;
    if (isDateString(resolved)) return storedDateText(resolved, ctx.fmt);
    const key = auditBooleanKey(field, resolved) ?? auditValueKey(field, resolved, ctx.subjectType);
    if (key) return translate(ctx.lang, key);
    const places = decimalPlaces(field, resolved);
    if (places !== null) return formatNumber(Number(resolved), ctx.lang, { decimals: places });
    return String(resolved);
}
