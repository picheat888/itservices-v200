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

/** More matches than this means the search is too broad to name actions (a letter or two); none are sent then. */
const MAX_EVENT_KEYS = 60;

/**
 * The keys (without `audit_ev_`) of the action names in `dict` that hold every word of `search`, for the
 * server to match against the stored English actions (AuditLogListService). Empty when nothing or too much matches.
 */
export function auditEventKeysMatching(dict: Readonly<Record<string, string>>, search: string): string[] {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const keys = Object.entries(dict)
        .filter(([key, name]) => key.startsWith('audit_ev_') && words.every((word) => name.toLowerCase().includes(word)))
        .map(([key]) => key.slice('audit_ev_'.length));
    return keys.length > MAX_EVENT_KEYS ? [] : keys;
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
const DETAIL_KEY_WORDS: Record<string, string> = { from: 'asset_hist_from', permissions: 'permissions', employee: 'transfer_mode_employee' };

/** The field label in the reader's language; a column with no key shows as stored. */
export function auditFieldText(field: string, t: Translate, subjectType?: string | null): string {
    const fallback = Object.hasOwn(DETAIL_KEY_WORDS, field) ? wordOr(t, DETAIL_KEY_WORDS[field], field) : field;
    return wordOr(t, auditFieldKey(field, subjectType), fallback);
}
