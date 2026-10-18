// Role Group rules shared by the tab and its dialog: the singular lang key, role names, the grant ceiling and the default-group choice.
// Dependency-free on purpose: node tests load it directly.

const SUPER_ROLE_KEY = 'super';
/** The role of someone in no group, and of a group without a role. */
export const BASE_ROLE_KEY = 'user';

type RoleName = { key: string; name: string | null };

/** `<key>_one` when n is 1 (EN singular; TH carries the same text), else the plain key. */
export function countKey(key: string, n: number): string {
    return n === 1 ? `${key}_one` : key;
}

/** A role's name, or its key when it has none (as the server's role_label). */
export function roleLabel(role: RoleName): string {
    return role.name ?? role.key;
}

/** The role a key names; no key is the base role. */
export function findRole<R extends RoleName>(roles: readonly R[], key: string | null): R | undefined {
    return roles.find((r) => r.key === (key ?? BASE_ROLE_KEY));
}

/** Name of the base role leavers fall back to. */
export function baseRoleLabel(roles: readonly RoleName[]): string {
    const base = findRole(roles, BASE_ROLE_KEY);
    return base ? roleLabel(base) : BASE_ROLE_KEY;
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

/** Lang key of why "Everyone in {dept}" is greyed out, or null while someone in it can be added. */
export function departmentLockKey(addable: number, groupOverCeiling: boolean, onlyMe: boolean): string | null {
    if (addable > 0) return null;
    if (groupOverCeiling) return 'perm_refusal_grant_ceiling';
    return onlyMe ? 'gr_your_account' : 'gr_admin_only';
}

type Translate = (key: string) => string;

/** Where leavers end up: the default group, else no group with the base role. */
export function leaversWhere(t: Translate, defaultGroupName: string | null, baseRole: string): string {
    return defaultGroupName ? t('gr_where_group').replace('{name}', defaultGroupName) : t('gr_where_none').replace('{role}', baseRole);
}

/** Confirm line for people taken out. */
export function removeLine(t: Translate, n: number, formatted: string, defaultGroupName: string | null, baseRole: string): string {
    return t(countKey('gr_confirm_remove', n))
        .replace('{n}', formatted)
        .replace('{where}', leaversWhere(t, defaultGroupName, baseRole));
}
