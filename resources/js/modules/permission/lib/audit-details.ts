// Audit entry details: whether a row has a detail panel, its one-line summary, and the words for stored enum values.
import type { AuditDetails } from '../api/permissionApi';

// Detail keys with a shape of their own; any other scalar key is a fact
const SHAPE_KEYS = new Set(['added', 'removed', 'role_changes', 'from', 'to', 'changes', 'items', 'facts', 'snapshot']);

/** Facts as key and text: details.facts, a `from` with no `to` (where a copy came from), then stray scalar keys (its permission count). */
export function auditFacts(d: AuditDetails | null): [string, string][] {
    if (!d) return [];
    const facts: [string, string][] = Object.entries(d.facts ?? {}).map(([key, value]) => [key, String(value)]);
    if (d.from !== undefined && d.to === undefined && !isBlankAuditValue(d.from)) facts.push(['from', String(d.from)]);
    for (const [key, value] of Object.entries(d as Record<string, unknown>)) {
        if (!SHAPE_KEYS.has(key) && (typeof value === 'string' || typeof value === 'number') && value !== '') facts.push([key, String(value)]);
    }
    return facts;
}

/** A before → after pair; a `from` alone is a fact. */
export const hasAuditMove = (d: AuditDetails | null): boolean => d?.to !== undefined;

/** Every shape the detail panel can draw; a shape left out gets no expand control. */
export function hasAuditDetails(d: AuditDetails | null): boolean {
    if (!d) return false;
    return (
        (d.added?.length ?? 0) > 0 ||
        (d.removed?.length ?? 0) > 0 ||
        (d.role_changes?.length ?? 0) > 0 ||
        hasAuditMove(d) ||
        Object.keys(d.changes ?? {}).length > 0 ||
        (d.items?.length ?? 0) > 0 ||
        auditFacts(d).length > 0 ||
        Object.keys(d.snapshot ?? {}).length > 0
    );
}

export function isBlankAuditValue(v: unknown): boolean {
    return v === null || v === undefined || v === '';
}

/** How the summary names a field and writes a value that is not blank. */
export type SummaryWords = { label: (field: string) => string; value: (field: string, v: unknown) => string };

const SUMMARY_CLIP = 60;

/** One-line summary under the event, with field labels and resolved names; a delete snapshot has none. */
export function auditDiffSummary(d: AuditDetails | null, words: SummaryWords): string | null {
    if (!d) return null;
    // Clipped hard: a value can be a whole email body; the panel shows all of it
    const val = (field: string, v: unknown) => {
        if (isBlankAuditValue(v)) return '—';
        const s = words.value(field, v).replace(/\s+/g, ' ').trim();
        return s.length > SUMMARY_CLIP ? `${s.slice(0, SUMMARY_CLIP)}…` : s;
    };
    const changes = Object.entries(d.changes ?? {});
    if (changes.length > 0) {
        const [field, { from, to }] = changes[0];
        const head = `${words.label(field)}: ${val(field, from)} → ${val(field, to)}`;
        return changes.length > 1 ? `${head}  +${changes.length - 1}` : head;
    }
    const added = d.added?.length ?? 0;
    const removed = d.removed?.length ?? 0;
    if (added || removed) return [added ? `+${added}` : null, removed ? `−${removed}` : null].filter(Boolean).join(' / ');
    if (hasAuditMove(d)) return `${val('', d.from)} → ${val('', d.to)}`;
    // Name the first record and count the rest
    const items = d.items ?? [];
    if (items.length > 0) return items.length > 1 ? `${items[0]}  +${items.length - 1}` : items[0];
    const facts = auditFacts(d);
    if (facts.length > 0) return facts.map(([key, value]) => `${words.label(key)}: ${val(key, value)}`).join('  ');
    return null;
}

/** The subject a stored subject_type names: a morph alias or the class base name, lower case, no underscores. */
export function auditSubjectName(subjectType: string | null | undefined): string {
    if (typeof subjectType !== 'string') return '';
    return (subjectType.split('\\').pop() ?? '').toLowerCase().replace(/_/g, '');
}

// Stored enum values per subject and column, mapped to the owning module's words
const VALUE_KEYS: Record<string, Record<string, Record<string, string>>> = {
    asset: {
        status: {
            ready: 'asset_ready',
            pending_acceptance: 'asset_pending_accept',
            deployed: 'asset_deployed',
            common: 'asset_common',
            pending_return: 'asset_pending_return',
            writeoff: 'asset_writeoff',
        },
        source: { purchased: 'asset_purchase', rented: 'asset_lease' },
    },
    contract: {
        type: {
            software: 'contract_type_software',
            hardware: 'contract_type_hardware',
            service: 'contract_type_service',
            connectivity: 'contract_type_connectivity',
            other: 'contract_type_other',
        },
        billing_cycle: { monthly: 'contract_billing_monthly', quarterly: 'contract_billing_quarterly', yearly: 'contract_billing_yearly' },
    },
    employee: { status: { active: 'emp_status_active', resigned: 'emp_status_resigned' } },
    software: {
        license_type: {
            perpetual: 'access_lic_perpetual',
            subscription: 'access_lic_subscription',
            free: 'access_lic_free',
            open_source: 'access_lic_open_source',
        },
    },
    requestoption: {
        request_type: Object.fromEntries(
            [
                'computer',
                'hardware',
                'mobile',
                'email',
                'social',
                'fileshare',
                'software',
                'recovery',
                'mailgroup',
                'telephone',
                'network',
                'cctv',
                'other',
            ].map((type) => [type, `req_${type}`]),
        ),
    },
};

/** The lang key for a stored enum value of this subject's column, if the owning module has a word for it. */
export function auditValueKey(field: string, value: unknown, subjectType: string | null | undefined): string | undefined {
    if (typeof value !== 'string') return undefined;
    const words = VALUE_KEYS[auditSubjectName(subjectType)]?.[field];
    return words && Object.hasOwn(words, value) ? words[value] : undefined;
}

// Boolean columns of the audited tables
const BOOLEAN_FIELDS = new Set([
    'active',
    'allow_special_position',
    'allowed',
    'auto_ticket',
    'enabled',
    'is_system',
    'must_change_password',
    'notify_7',
    'notify_30',
    'notify_45',
    'notify_60',
    'notify_90',
    'notify_120',
    'notify_150',
    'track_serial',
    'warranty_lifetime',
]);

/** `yes` / `no` for a known boolean column stored as true/false, 1/0 or "1"/"0"; anything else undefined. */
export function auditBooleanKey(field: string, value: unknown): 'yes' | 'no' | undefined {
    if (!BOOLEAN_FIELDS.has(field)) return undefined;
    if (value === true || value === 1 || value === '1') return 'yes';
    if (value === false || value === 0 || value === '0') return 'no';
    return undefined;
}

// Money and quantity columns stored as decimals
const DECIMAL_FIELDS = new Set(['value', 'total_value', 'cost', 'unit_cost', 'price', 'amount']);

/** A known decimal column's stored value ("1500.00"): its digits after the point, else null. */
export function decimalPlaces(field: string, value: unknown): number | null {
    if (!DECIMAL_FIELDS.has(field) || typeof value !== 'string' || !/^-?\d+\.\d+$/.test(value)) return null;
    return value.split('.')[1].length;
}
