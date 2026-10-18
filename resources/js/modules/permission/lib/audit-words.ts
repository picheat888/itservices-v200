// Lang keys for audit log words: an event name from its stored action, a field label by column (and subject for owner).

type Translate = (key: string) => string;

/** `Force-recalled asset` → `audit_ev_force_recalled_asset`. */
export function auditEventKey(action: string): string {
    const slug = action
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `audit_ev_${slug}`;
}

/** The stored subject_type is a morph alias or a class name; an asset is stored by class name. */
export function isAssetSubject(subjectType: string | null | undefined): boolean {
    return typeof subjectType === 'string' && /(^|\\)asset$/i.test(subjectType);
}

/** owner_employee_id is the holder on an asset and the owner on everything else. */
export function auditFieldKey(field: string, subjectType?: string | null): string {
    if (field === 'owner_employee_id' && isAssetSubject(subjectType)) return 'audit_field_owner';
    return `audit_field_${field}`;
}

/** The translation, or the fallback when the key has no word. */
function wordOr(t: Translate, key: string, fallback: string): string {
    const word = t(key);
    return word === key ? fallback : word;
}

/** The event name in the reader's language; an action with no key shows as stored. */
export function auditEventLabel(action: string, t: Translate): string {
    return wordOr(t, auditEventKey(action), action);
}

// Detail keys with no audit_field_* word, read with words the app already has
const DETAIL_KEY_WORDS: Record<string, string> = { from: 'asset_hist_from', permissions: 'permissions' };

/** The field label in the reader's language; a column with no key shows as stored. */
export function auditFieldText(field: string, t: Translate, subjectType?: string | null): string {
    const fallback = Object.hasOwn(DETAIL_KEY_WORDS, field) ? wordOr(t, DETAIL_KEY_WORDS[field], field) : field;
    return wordOr(t, auditFieldKey(field, subjectType), fallback);
}
