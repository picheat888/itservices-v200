// Role Group rules shared by the tab and its dialog: the singular lang key, the grant ceiling and the default-group choice.
// Dependency-free on purpose: node tests load it directly.

const SUPER_ROLE_KEY = 'super';

/** `<key>_one` when n is 1 (EN singular; TH carries the same text), else the plain key. */
export function countKey(key: string, n: number): string {
    return n === 1 ? `${key}_one` : key;
}

/** A role the caller may not hand out: the Super admin role, or one holding a permission they lack. */
export function isOverCeiling(role: { is_super: boolean; permissions: string[] }, isSuper: boolean, myPermissions: ReadonlySet<string>): boolean {
    if (isSuper) return false;
    return role.is_super || role.permissions.some((key) => !myPermissions.has(key));
}

/** Lang key of why a group cannot become the default, or null; an unknown role is left to the server. */
export function defaultOffReasonKey(
    group: { id: number; role: string | null },
    defaultGroupId: number | null,
    role: { is_super: boolean; permissions: string[] } | undefined,
    isSuper: boolean,
    myPermissions: ReadonlySet<string>,
): string | null {
    if (group.id === defaultGroupId) return null;
    if (group.role === SUPER_ROLE_KEY) return 'gr_default_super_off';
    return role && isOverCeiling(role, isSuper, myPermissions) ? 'perm_refusal_grant_ceiling' : null;
}

type Translate = (key: string) => string;

/** Where leavers end up: the default group, else no group with the base role; null when neither is known. */
export function leaversWhere(t: Translate, defaultGroupName: string | null, baseRole: string): string | null {
    if (defaultGroupName) return t('gr_where_group').replace('{name}', defaultGroupName);
    return baseRole ? t('gr_where_none').replace('{role}', baseRole) : null;
}

/** Confirm line for people taken out; an unknown destination drops the "(…)" part. */
export function removeLine(t: Translate, count: string, defaultGroupName: string | null, baseRole: string): string {
    const where = leaversWhere(t, defaultGroupName, baseRole);
    const line = t('gr_confirm_remove').replace('{n}', count);
    return where === null ? line.replace(/\s*\(\{where\}\)/, '') : line.replace('{where}', where);
}
