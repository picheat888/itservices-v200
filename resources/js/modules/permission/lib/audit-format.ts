// Readable audit-log diffs: raw column names become labels and older foreign-key ids become names, at display time.

import { translate } from '@/lang';
import type { Lang } from '@/shared/types';
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

/**
 * Resolves an audit diff value to a human label. For foreign-key fields the
 * numeric id is swapped for the entity name (falling back to `#<id>` when the
 * record no longer exists). Non-FK values are returned unchanged.
 */
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
