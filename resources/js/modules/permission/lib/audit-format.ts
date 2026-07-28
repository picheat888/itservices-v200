// Human-readable formatting for audit-log diffs. Entries are stored with raw DB
// column names and foreign-key ids (e.g. `position_id: 5 → 12`); these helpers
// turn those into friendly labels and resolved entity names at display time, so
// historical logs become readable without rewriting stored data.

import { translate } from '@/lang';
import type { Lang } from '@/shared/types';

/**
 * Maps a raw DB column name to a friendly label. The labels live in
 * lang/<locale>/permissions.ts under keys `audit_field_<column>`; this resolves
 * them and falls back to the raw column name when no label exists.
 */
export function auditFieldLabel(field: string, lang: Lang): string {
    const k = `audit_field_${field}`;
    const v = translate(lang, k);
    return v === k ? field : v;
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
